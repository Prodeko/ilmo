import { SsoLoginError } from "@app/lib"
import { FastifyBaseLogger, FastifyPluginAsync, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import * as oidc from "openid-client"
import { Pool, PoolClient } from "pg"

import {
  BREAK_GLASS_USERNAMES,
  keycloakEnabled,
  KeycloakProfile,
  mapKeycloakClaims,
  sanitizeNext,
} from "../utils/keycloak"

import { cookieOptions } from "./installSession"

export interface OidcSessionData {
  verifier: string
  state: string
  nonce: string
  next: string
  /**
   * Set only when the round trip started from an explicit "link my Keycloak
   * account" request. It is what allows the callback to bind the returning
   * subject to the session's existing user.
   */
  link?: true
}

declare module "@fastify/secure-session" {
  interface SessionData {
    oidc?: OidcSessionData
    // Present only on sessions established through Keycloak; logout uses it to
    // decide whether to also end the IdP session. `false` would mean nothing
    // that `absent` does not, so it is not representable.
    sso?: true
  }
}

/**
 * The session is attacker-supplied input once the cookie leaves our process,
 * and an older release may have written a different shape. Everything the
 * callback relies on has to be proven present before it is trusted.
 */
function isOidcSessionData(value: unknown): value is OidcSessionData {
  if (typeof value !== "object" || value === null) return false
  const data = value as Record<string, unknown>
  return (["verifier", "state", "nonce", "next"] as const).every(
    (key) => typeof data[key] === "string" && data[key] !== ""
  )
}

let configPromise: Promise<oidc.Configuration> | null = null

/**
 * Lazy, memoized OIDC discovery. Never called at boot so a Keycloak outage
 * cannot prevent the server from starting; a failed attempt resets the cache
 * so the next request retries.
 */
export function getKeycloakConfig(): Promise<oidc.Configuration> {
  if (!configPromise) {
    const issuer = new URL(process.env.KEYCLOAK_ISSUER!)
    // allowInsecureRequests lifts the https requirement for *every* call made
    // with this configuration, the token request that carries the client
    // secret included. It is therefore restricted to a plain-http issuer
    // outside production: a production deployment pointed at http:// fails
    // loudly during discovery instead of putting the secret on the wire in
    // the clear.
    const insecureAllowed =
      issuer.protocol === "http:" && process.env.NODE_ENV !== "production"
    configPromise = oidc
      .discovery(
        issuer,
        process.env.KEYCLOAK_CLIENT_ID!,
        process.env.KEYCLOAK_CLIENT_SECRET!,
        undefined,
        insecureAllowed ? { execute: [oidc.allowInsecureRequests] } : undefined
      )
      .catch((e) => {
        configPromise = null
        throw e
      })
  }
  return configPromise
}

export function resetKeycloakConfigForTests(): void {
  configPromise = null
}

export type RequestLogger = Pick<FastifyBaseLogger, "debug" | "error">

/**
 * End-session URL for RP-initiated logout, or null when the user has no
 * Keycloak identity or Keycloak is unreachable — logout must never fail
 * because the IdP is down.
 *
 * Callers pass the logger of whatever is handling the request; `console`
 * stands in only so a caller without one still leaves a trace.
 */
export async function buildKeycloakLogoutUrl(
  rootPgPool: Pool,
  userId: string,
  logger: RequestLogger = console
): Promise<string | null> {
  if (!keycloakEnabled()) return null

  let idToken: string | null = null
  try {
    const {
      rows: [row],
    } = await rootPgPool.query(
      // A user can hold more than one Keycloak identity; the newest one is
      // the only ID token that can still be a valid hint.
      `select uas.details->>'id_token' as id_token
         from app_private.user_authentication_secrets uas
         join app_public.user_authentications ua
           on ua.id = uas.user_authentication_id
        where ua.user_id = $1 and ua.service = 'keycloak'
        order by ua.created_at desc
        limit 1`,
      [userId]
    )
    idToken = row?.id_token ?? null
  } catch (e) {
    // Distinct from the debug line below: a database outage must not read as
    // "this user simply has no Keycloak identity".
    logger.error(
      { err: e, userId },
      "keycloak logout: reading the stored id token failed"
    )
    return null
  }

  if (!idToken) {
    logger.debug(
      { userId },
      "keycloak logout: user has no keycloak identity, skipping RP-initiated logout"
    )
    return null
  }

  try {
    const config = await getKeycloakConfig()
    return oidc.buildEndSessionUrl(config, {
      id_token_hint: idToken,
      post_logout_redirect_uri: `${process.env.ROOT_URL}/`,
    }).href
  } catch (e) {
    logger.error(
      { err: e, userId },
      "keycloak logout: discovery or end-session url construction failed"
    )
    return null
  }
}

/**
 * True when the navigation provably started on this origin. Browsers send
 * Sec-Fetch-Site on every request; the referer fallback covers clients that
 * predate it. Anything unverifiable counts as cross-site.
 */
function isSameOriginNavigation(request: FastifyRequest): boolean {
  const site = request.headers["sec-fetch-site"]
  if (typeof site === "string") {
    return site === "same-origin"
  }
  const referer = request.headers.referer
  if (typeof referer === "string") {
    try {
      return new URL(referer).origin === new URL(process.env.ROOT_URL!).origin
    } catch {
      return false
    }
  }
  return false
}

const InstallKeycloak: FastifyPluginAsync = async (app) => {
  if (!keycloakEnabled()) {
    const message =
      "KEYCLOAK_ISSUER / KEYCLOAK_CLIENT_ID / KEYCLOAK_CLIENT_SECRET not all set; SSO login disabled"
    // Outside production this is the ordinary local setup. In production it
    // means one typo has degraded the whole organisation to password-only
    // login, which nobody would notice in a warn.
    if (process.env.NODE_ENV === "production") {
      app.log.error(message)
    } else {
      app.log.warn(message)
    }
    return
  }

  app.get("/auth/keycloak", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, unknown>
    const next = sanitizeNext(
      typeof query.next === "string" ? query.next : null
    )
    // `link=1` is the only thing that turns a live session into a link
    // target. Without it an already-authenticated user has nothing to gain
    // from a Keycloak round trip, and completing one would bind whichever
    // subject Keycloak happens to return to the account they are signed into.
    // The intent rides on a GET, so it only counts when the navigation
    // provably started on this origin — otherwise a cross-site page could
    // silently link its visitor's Keycloak identity onto their account.
    const wantsLink = query.link === "1" && isSameOriginNavigation(request)
    if (query.link === "1" && !wantsLink) {
      request.log.warn(
        "keycloak link intent from a cross-site navigation ignored; proceeding as a plain login"
      )
    }

    try {
      if (request.user?.sessionId) {
        // The cookie alone doesn't prove the session still exists; a
        // signed-in short-circuit on a stale cookie would bounce between
        // /login and here forever with no Keycloak round trip to heal it.
        const {
          rows: [live],
        } = await app.rootPgPool.query(
          "select 1 from app_private.sessions where uuid = $1",
          [request.user.sessionId]
        )
        if (live) {
          if (!wantsLink) {
            return reply.redirect(next)
          }
        } else {
          await request.logOut()
        }
      }

      const config = await getKeycloakConfig()
      const verifier = oidc.randomPKCECodeVerifier()
      const codeChallenge = await oidc.calculatePKCECodeChallenge(verifier)
      const state = oidc.randomState()
      const nonce = oidc.randomNonce()
      const oidcData: OidcSessionData = { verifier, state, nonce, next }
      if (wantsLink) {
        oidcData.link = true
      }
      request.session.set("oidc", oidcData)
      const authUrl = oidc.buildAuthorizationUrl(config, {
        redirect_uri: `${process.env.ROOT_URL}/auth/keycloak/callback`,
        scope: "openid profile email",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
      })
      return reply.redirect(authUrl.href)
    } catch (e) {
      // Anything here is a server-side problem; a raw 500 in the browser is
      // never the right answer for a route a user reached by clicking a
      // button.
      request.log.error(
        { err: e },
        "keycloak authorization request could not be built"
      )
      return reply.redirect("/login?error=sso_unavailable")
    }
  })

  app.get("/auth/keycloak/callback", async (request, reply) => {
    const stored = request.session.get("oidc")
    request.session.set("oidc", undefined)
    if (!isOidcSessionData(stored)) {
      request.log.warn(
        "keycloak callback without usable oidc state in the session; refusing"
      )
      return reply.redirect("/login?error=state_mismatch")
    }
    const oidcData = stored

    let config: oidc.Configuration
    try {
      config = await getKeycloakConfig()
    } catch (e) {
      request.log.error({ err: e }, "keycloak discovery failed")
      return reply.redirect("/login?error=sso_unavailable")
    }

    let idToken: string
    let claims: Record<string, unknown>
    try {
      const currentUrl = new URL(request.raw.url!, process.env.ROOT_URL)
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: oidcData.verifier,
        expectedState: oidcData.state,
        expectedNonce: oidcData.nonce,
        idTokenExpected: true,
      })
      idToken = tokens.id_token!
      claims = tokens.claims()! as Record<string, unknown>
    } catch (e) {
      request.log.error({ err: e }, "keycloak code exchange failed")
      return reply.redirect("/login?error=code_exchange_failed")
    }

    let profile: KeycloakProfile
    try {
      profile = mapKeycloakClaims(claims, request.log)
    } catch (e) {
      if (e?.["code"] === "KCCLM") {
        request.log.error(
          { missingClaims: e["missingClaims"] },
          "keycloak id token is missing required claims; check the client's protocol mappers"
        )
        return reply.redirect("/login?error=missing_claims")
      }
      request.log.error({ err: e }, "keycloak claim mapping failed")
      return reply.redirect("/login?error=login_failed")
    }

    if (!profile.emailVerified) {
      request.log.warn(
        { sub: profile.sub },
        "keycloak login refused: email is not verified"
      )
      return reply.redirect("/login?error=email_not_verified")
    }

    // Registering the identity, the break-glass veto, the is_admin stamp and
    // the session row are one decision: none of them may survive without the
    // others, so they share a single connection and a single transaction.
    const establishSession = async (): Promise<
      { sessionUuid: string } | { error: SsoLoginError }
    > => {
      // Assigned inside the try: pool checkout itself can fail (outage,
      // saturation), and that failure must land on the error page like any
      // other, not surface as a raw 500.
      let client: PoolClient | undefined
      const rollback = async () => {
        if (!client) return
        try {
          await client.query("rollback")
        } catch (e) {
          request.log.error(
            { err: e, sub: profile.sub },
            "keycloak login: ROLLBACK FAILED; a keycloak identity may be left linked to an account it must not reach"
          )
        }
      }
      try {
        client = await app.rootPgPool.connect()
        await client.query("begin")

        // Only an explicit link request may attach this subject to the
        // account that is already signed in; a plain login must resolve the
        // user from the Keycloak identity alone.
        let existingUserId: string | null = null
        if (oidcData.link && request.user?.sessionId) {
          const {
            rows: [existing],
          } = await client.query(
            "select user_id from app_private.sessions where uuid = $1",
            [request.user.sessionId]
          )
          existingUserId = existing?.user_id ?? null
        }

        const {
          rows: [user],
        } = await client.query(
          `select * from app_private.link_or_register_user($1, $2, $3, $4, $5)`,
          [
            existingUserId,
            "keycloak",
            profile.sub,
            JSON.stringify({
              username: profile.usernameSuggestion,
              email: profile.email,
              name: profile.name,
            }),
            JSON.stringify({ id_token: idToken }),
          ]
        )
        if (!user?.id) {
          throw new Error("link_or_register_user returned no user")
        }

        // The database owns the username: it slugifies the suggestion and
        // disambiguates collisions, so this is the only value that can be
        // compared against the block list.
        if (
          BREAK_GLASS_USERNAMES.includes(String(user.username).toLowerCase())
        ) {
          request.log.error(
            { userId: user.id, sub: profile.sub },
            "keycloak break-glass collision: refusing to bind an SSO identity to a break-glass account"
          )
          // Rolling back is what makes this uniform. It undoes a link onto a
          // pre-existing break-glass account and, equally, the fresh user
          // that link_or_register_user would otherwise leave behind when a
          // new subject's slugified name squats a break-glass username.
          await rollback()
          return { error: "account_conflict" }
        }

        // The registry is the source of truth for admin rights, so this
        // both grants and revokes.
        await client.query(
          `update app_public.users set is_admin = $1 where id = $2`,
          [profile.isAdmin, user.id]
        )

        const {
          rows: [session],
        } = await client.query(
          `insert into app_private.sessions (user_id) values ($1) returning *`,
          [user.id]
        )
        await client.query("commit")
        return { sessionUuid: session.uuid }
      } catch (e) {
        await rollback()
        // TAKEN (identity already linked to a different account) and any
        // unexpected DB failure land here; details go to logs only.
        request.log.error({ err: e }, "keycloak login failed")
        return {
          error: e?.["code"] === "TAKEN" ? "account_conflict" : "login_failed",
        }
      } finally {
        client?.release()
      }
    }

    const outcome = await establishSession()
    if ("error" in outcome) {
      return reply.redirect(`/login?error=${outcome.error}`)
    }

    try {
      // @fastify/passport regenerates the session on login, discarding
      // anything written to it beforehand, so logIn has to come first and
      // every other session write after it.
      await request.logIn({ sessionId: outcome.sessionUuid })
    } catch (e) {
      request.log.error(
        { err: e },
        "keycloak login: establishing the app session failed"
      )
      return reply.redirect("/login?error=login_failed")
    }

    try {
      request.session.set("sso", true)
      if (profile.locale) {
        reply.setCookie("NEXT_LOCALE", profile.locale, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
          // Matches the session cookie: over https the locale hint has no
          // business travelling in the clear either.
          secure: cookieOptions.secure === true,
        })
      }
    } catch (e) {
      // The user is authenticated by this point. Sending them to
      // /login?error=... would be a lie, and AuthRestrict.LOGGED_IN would
      // bounce them off that page before the alert rendered anyway.
      request.log.error(
        { err: e },
        "keycloak login succeeded but post-login session bookkeeping failed"
      )
    }
    return reply.redirect(oidcData.next)
  })
}

export default fp(InstallKeycloak)
