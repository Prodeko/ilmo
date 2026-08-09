import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import * as oidc from "openid-client"
import { Pool } from "pg"

import {
  BREAK_GLASS_USERNAMES,
  keycloakEnabled,
  mapKeycloakClaims,
  sanitizeNext,
} from "../utils/keycloak"

export interface OidcSessionData {
  verifier: string
  state: string
  nonce: string
  next: string
}

declare module "@fastify/secure-session" {
  interface SessionData {
    oidc: OidcSessionData
    sso: boolean
  }
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
    configPromise = oidc
      .discovery(
        issuer,
        process.env.KEYCLOAK_CLIENT_ID!,
        process.env.KEYCLOAK_CLIENT_SECRET!,
        undefined,
        // Local dev Keycloak is plain http
        issuer.protocol === "http:"
          ? { execute: [oidc.allowInsecureRequests] }
          : undefined
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
 * End-session URL for RP-initiated logout, or null when the user has no
 * Keycloak identity or Keycloak is unreachable — logout must never fail
 * because the IdP is down.
 */
export async function buildKeycloakLogoutUrl(
  rootPgPool: Pool,
  userId: string
): Promise<string | null> {
  if (!keycloakEnabled()) return null
  try {
    const {
      rows: [row],
    } = await rootPgPool.query(
      `select uas.details->>'id_token' as id_token
         from app_private.user_authentication_secrets uas
         join app_public.user_authentications ua
           on ua.id = uas.user_authentication_id
        where ua.user_id = $1 and ua.service = 'keycloak'`,
      [userId]
    )
    if (!row?.id_token) return null
    const config = await getKeycloakConfig()
    return oidc.buildEndSessionUrl(config, {
      id_token_hint: row.id_token,
      post_logout_redirect_uri: `${process.env.ROOT_URL}/`,
    }).href
  } catch (e) {
    // Without this a database outage or an unreachable Keycloak is
    // indistinguishable from "this user has no Keycloak identity".
    console.error("keycloak logout url could not be built", e)
    return null
  }
}

const InstallKeycloak: FastifyPluginAsync = async (app) => {
  if (!keycloakEnabled()) {
    app.log.warn(
      "KEYCLOAK_ISSUER / KEYCLOAK_CLIENT_ID / KEYCLOAK_CLIENT_SECRET not all set; SSO login disabled"
    )
    return
  }

  app.get("/auth/keycloak", async (request, reply) => {
    let config: oidc.Configuration
    try {
      config = await getKeycloakConfig()
    } catch (e) {
      request.log.error({ err: e }, "keycloak discovery failed")
      return reply.redirect("/login?error=sso_unavailable")
    }
    const verifier = oidc.randomPKCECodeVerifier()
    const codeChallenge = await oidc.calculatePKCECodeChallenge(verifier)
    const state = oidc.randomState()
    const nonce = oidc.randomNonce()
    const next = sanitizeNext((request.query as Record<string, unknown>)?.next)
    const oidcData: OidcSessionData = { verifier, state, nonce, next }
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
  })

  app.get("/auth/keycloak/callback", async (request, reply) => {
    const oidcData = request.session.get("oidc") as OidcSessionData | undefined
    request.session.set("oidc", undefined)
    if (!oidcData) {
      request.log.warn(
        "keycloak callback without oidc state in the session; refusing"
      )
      return reply.redirect("/login?error=state_mismatch")
    }

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

    try {
      const profile = mapKeycloakClaims(claims)
      if (!profile.emailVerified) {
        request.log.warn(
          { sub: profile.sub },
          "keycloak login refused: email is not verified"
        )
        return reply.redirect("/login?error=email_not_verified")
      }

      const rootPgPool = app.rootPgPool

      // If already logged in, link the Keycloak identity to that account
      // (settings/accounts flow) instead of switching accounts.
      let existingUserId: string | null = null
      if (request.user?.sessionId) {
        const {
          rows: [existing],
        } = await rootPgPool.query(
          "select user_id from app_private.sessions where uuid = $1",
          [request.user.sessionId]
        )
        existingUserId = existing?.user_id ?? null
      }

      const {
        rows: [user],
      } = await rootPgPool.query(
        `select * from app_private.link_or_register_user($1, $2, $3, $4, $5)`,
        [
          existingUserId,
          "keycloak",
          profile.sub,
          JSON.stringify({
            username: profile.username,
            email: profile.email,
            name: profile.name,
          }),
          JSON.stringify({ id_token: idToken }),
        ]
      )
      if (!user?.id) {
        throw new Error("link_or_register_user returned no user")
      }

      if (BREAK_GLASS_USERNAMES.includes(String(user.username).toLowerCase())) {
        // link_or_register_user has already attached the identity (and stored
        // the ID token) by this point. Undo that: leaving the row would let
        // this Keycloak subject into the break-glass account the moment the
        // username left the block list. Cascades to
        // app_private.user_authentication_secrets.
        await rootPgPool.query(
          `delete from app_public.user_authentications
            where service = 'keycloak' and identifier = $1`,
          [profile.sub]
        )
        request.log.error(
          { userId: user.id },
          "keycloak login collided with a break-glass account"
        )
        return reply.redirect("/login?error=account_conflict")
      }

      await rootPgPool.query(
        `update app_public.users set is_admin = $1 where id = $2`,
        [profile.isAdmin, user.id]
      )

      const {
        rows: [session],
      } = await rootPgPool.query(
        `insert into app_private.sessions (user_id) values ($1) returning *`,
        [user.id]
      )
      await request.logIn({ sessionId: session.uuid })
      request.session.set("sso", true)

      if (profile.locale) {
        reply.setCookie("NEXT_LOCALE", profile.locale, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        })
      }
      return reply.redirect(oidcData.next)
    } catch (e) {
      // TAKEN (identity already linked to a different account) and any
      // unexpected DB failure land here; details go to logs only.
      request.log.error({ err: e }, "keycloak login failed")
      const code = e["code"] === "TAKEN" ? "account_conflict" : "login_failed"
      return reply.redirect(`/login?error=${code}`)
    }
  })
}

export default fp(InstallKeycloak)
