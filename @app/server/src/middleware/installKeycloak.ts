import { SsoLoginError } from "@app/lib"
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import * as oidc from "openid-client"
import { Pool, PoolClient } from "pg"

import {
  BREAK_GLASS_USERNAMES,
  keycloakEnabled,
  KeycloakProfile,
  mapKeycloakClaims,
  RequestLogger,
  sanitizeNext,
} from "../utils/keycloak"

import { cookieOptions } from "./installSession"

export type { RequestLogger }

/**
 * Every failure redirect goes through here so the code is compile-checked
 * against the shared SsoLoginError union — a typo'd literal would otherwise
 * render as the generic failure message with no warning anywhere.
 */
function loginErrorRedirect(reply: FastifyReply, code: SsoLoginError) {
  return reply.redirect(`/login?error=${code}`)
}

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
 * The session cookie round-trips through the client, and its contents can
 * predate the shape the current deployment writes. Everything the callback
 * relies on is proven present — and `link`, which carries an authorization
 * decision, proven exact — before any of it is trusted.
 */
function isOidcSessionData(value: unknown): value is OidcSessionData {
  if (typeof value !== "object" || value === null) return false
  const data = value as Record<string, unknown>
  return (
    (["verifier", "state", "nonce", "next"] as const).every(
      (key) => typeof data[key] === "string" && data[key] !== ""
    ) &&
    (data.link === undefined || data.link === true)
  )
}

let configPromise: Promise<oidc.Configuration> | null = null

/**
 * Lazy, memoized OIDC discovery. Never called at boot so a Keycloak outage
 * cannot prevent the server from starting; a failed attempt resets the cache
 * so the next request retries. The KEYCLOAK_* credentials are captured at the
 * first successful call and frozen into the memoized configuration — rotating
 * them requires a restart.
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

/**
 * End-session URL for RP-initiated logout, or null whenever one cannot be
 * constructed: SSO is disabled, the user has no Keycloak identity, the stored
 * token could not be read, or Keycloak is unreachable. Null uniformly means
 * "just log out locally" — logout must never fail because the IdP is down.
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
      // A user can hold more than one Keycloak identity; any one valid hint
      // is enough for RP-initiated logout, so use the most recently linked.
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
    } catch (e) {
      // An unparseable ROOT_URL is our own misconfiguration, not a cross-site
      // request; it must not hide behind the same `false` an attacker gets.
      request.log.error(
        { err: e, referer },
        "referer or ROOT_URL could not be parsed while verifying a same-origin navigation"
      )
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

    try {
      let sessionAlive = false
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
          sessionAlive = true
        } else {
          await request.logOut()
        }
      }

      if (query.link === "1") {
        // A link request that cannot be honoured must fail visibly. Falling
        // through to a plain login would either sign the user into a
        // different account or, for an unverifiable navigation, quietly
        // reload the page with nothing linked.
        if (!sessionAlive) {
          request.log.warn(
            "keycloak link requested without a live app session; the user must sign in before linking"
          )
          return loginErrorRedirect(reply, "link_session_lost")
        }
        if (!wantsLink) {
          request.log.warn(
            "keycloak link intent could not be verified as a same-origin navigation; refusing to link"
          )
          return reply.redirect("/settings/accounts?linkError=intent")
        }
      } else if (sessionAlive) {
        return reply.redirect(next)
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
      return loginErrorRedirect(reply, "sso_unavailable")
    }
  })

  app.get("/auth/keycloak/callback", async (request, reply) => {
    const stored = request.session.get("oidc")
    request.session.set("oidc", undefined)
    if (!isOidcSessionData(stored)) {
      request.log.warn(
        "keycloak callback without usable oidc state in the session; refusing"
      )
      return loginErrorRedirect(reply, "state_mismatch")
    }
    const oidcData = stored

    let config: oidc.Configuration
    try {
      config = await getKeycloakConfig()
    } catch (e) {
      request.log.error({ err: e }, "keycloak discovery failed")
      return loginErrorRedirect(reply, "sso_unavailable")
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
      const tokenClaims = tokens.claims()
      if (!tokens.id_token || !tokenClaims) {
        throw new Error("token response carried no id token")
      }
      idToken = tokens.id_token
      claims = tokenClaims as Record<string, unknown>
    } catch (e) {
      // The provider reported an outcome of its own — most commonly the user
      // pressing Cancel on the Keycloak page. That is not a failure to retry,
      // so it goes home without an alert.
      if (
        e instanceof oidc.AuthorizationResponseError &&
        e.error === "access_denied"
      ) {
        request.log.info("keycloak sign-in cancelled at the provider")
        return reply.redirect("/")
      }
      // The token endpoint could not be reached at all. This is the same
      // outage sso_unavailable already describes, and that code is the one
      // whose error page offers the local sign-in escape hatch.
      if (e instanceof TypeError) {
        request.log.error(
          { err: e },
          "keycloak token endpoint could not be reached"
        )
        return loginErrorRedirect(reply, "sso_unavailable")
      }
      request.log.error({ err: e }, "keycloak code exchange failed")
      return loginErrorRedirect(reply, "code_exchange_failed")
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
        return loginErrorRedirect(reply, "missing_claims")
      }
      request.log.error({ err: e }, "keycloak claim mapping failed")
      return loginErrorRedirect(reply, "login_failed")
    }

    if (!profile.emailVerified) {
      request.log.warn(
        {
          sub: profile.sub,
          emailVerifiedClaimPresent: "email_verified" in claims,
        },
        "keycloak login refused: email is not verified"
      )
      return loginErrorRedirect(reply, "email_not_verified")
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
      // A connection whose ROLLBACK failed may still hold an open transaction,
      // and releasing it normally would hand that transaction to the next
      // checkout. Destroying the connection is the only safe disposal.
      let rollbackFailed = false
      const rollback = async () => {
        if (!client) return
        try {
          await client.query("rollback")
        } catch (e) {
          rollbackFailed = true
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
        // user from the Keycloak identity alone. A link request whose session
        // died mid-round-trip must fail rather than fall through to a plain
        // login — the user asked to link onto an account, not to be signed in
        // as whoever this subject resolves to.
        let existingUserId: string | null = null
        if (oidcData.link) {
          if (request.user?.sessionId) {
            const {
              rows: [existing],
            } = await client.query(
              "select user_id from app_private.sessions where uuid = $1",
              [request.user.sessionId]
            )
            existingUserId = existing?.user_id ?? null
          }
          if (!existingUserId) {
            request.log.warn(
              { sub: profile.sub },
              "keycloak link requested but the app session was gone by callback time; refusing"
            )
            await rollback()
            return { error: "link_session_lost" }
          }
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

        // The registry is the source of truth for admin rights, so this both
        // grants and revokes — but only when the token actually answered the
        // roles question. isAdmin: null means the mapper is broken and the
        // roles are unknown; stamping false here would demote every admin one
        // login at a time.
        if (profile.isAdmin === null) {
          request.log.error(
            { sub: profile.sub, userId: user.id },
            "keycloak id token carried no usable realm_access.roles claim; leaving is_admin untouched — check the client's realm-roles mapper"
          )
        } else {
          await client.query(
            `update app_public.users set is_admin = $1 where id = $2`,
            [profile.isAdmin, user.id]
          )
        }

        const {
          rows: [session],
        } = await client.query(
          `insert into app_private.sessions (user_id) values ($1) returning *`,
          [user.id]
        )
        // Read before COMMIT: a failure after the commit would reach the
        // catch below and be reported as a rolled-back login while the rows
        // are durably in place.
        const sessionUuid: string | undefined = session?.uuid
        if (!sessionUuid) {
          throw new Error("session insert returned no uuid")
        }
        await client.query("commit")
        return { sessionUuid }
      } catch (e) {
        await rollback()
        // TAKEN (identity already linked to a different account) and any
        // unexpected DB failure land here; details go to logs only.
        request.log.error({ err: e, sub: profile.sub }, "keycloak login failed")
        return {
          error: e?.["code"] === "TAKEN" ? "account_conflict" : "login_failed",
        }
      } finally {
        client?.release(rollbackFailed)
      }
    }

    const outcome = await establishSession()
    if ("error" in outcome) {
      return loginErrorRedirect(reply, outcome.error)
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
      return loginErrorRedirect(reply, "login_failed")
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
    // Re-sanitized on the way out: the guard above only proves `next` is a
    // non-empty string, and a session written by an older deployment may
    // carry a value the current rules would reject.
    return reply.redirect(sanitizeNext(oidcData.next))
  })
}

export default fp(InstallKeycloak)
