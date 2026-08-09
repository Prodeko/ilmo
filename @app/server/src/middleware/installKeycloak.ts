import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import * as oidc from "openid-client"

import { keycloakEnabled, sanitizeNext } from "../utils/keycloak"

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
}

export default fp(InstallKeycloak)
