import { keycloakEnabled, sanitizeNext } from "@app/lib"
import { FastifyBaseLogger } from "fastify"

// The login page computes the same `next` and needs the same enable check, so
// both live in @app/lib. Server code imports them through this module
// alongside the server-only helpers below.
export { keycloakEnabled, sanitizeNext }

/**
 * The slice of a fastify logger the SSO code needs. `console` satisfies it,
 * which is what lets helpers fall back to a bare `console` when no
 * request-correlated logger is available.
 */
export type RequestLogger = Pick<FastifyBaseLogger, "debug" | "warn" | "error">

export const ILMO_ADMIN_ROLE = "ilmo-admin"

// Local accounts kept for break-glass access; an SSO login must never link
// onto (or flip is_admin on) these rows. Compared lowercase (username is citext).
export const BREAK_GLASS_USERNAMES = ["prodekocto", "prodekotoimari"]

export interface KeycloakProfile {
  readonly sub: string
  readonly email: string
  readonly emailVerified: boolean
  readonly name: string
  /**
   * The raw email localpart. It is *not* a valid app username: register_user
   * strips and slugifies it and appends a counter to break ties, so only the
   * username the database hands back may be compared against
   * BREAK_GLASS_USERNAMES.
   */
  readonly usernameSuggestion: string
  readonly locale: "fi" | "en" | "se" | null
  /**
   * `null` when the ID token carried no usable `realm_access.roles` claim.
   * That means the client's role mapper is misconfigured and the roles are
   * unknown — which must not be read as "not an admin", or a dropped mapper
   * quietly demotes every admin on their next login.
   */
  readonly isAdmin: boolean | null
}

export function mapKeycloakClaims(
  claims: Record<string, unknown>,
  logger?: Pick<RequestLogger, "warn">
): KeycloakProfile {
  const sub = typeof claims.sub === "string" ? claims.sub : null
  const email = typeof claims.email === "string" ? claims.email : null
  if (!sub || !email) {
    const e = new Error("ID token is missing required sub/email claims")
    e["code"] = "KCCLM"
    // Names only: claim values are identity data and stay out of the logs.
    e["missingClaims"] = [!sub && "sub", !email && "email"].filter(Boolean)
    throw e
  }
  const localpart = email.split("@")[0]
  const realmAccess = claims.realm_access as { roles?: unknown } | undefined
  const roles = Array.isArray(realmAccess?.roles)
    ? realmAccess!.roles.filter((r): r is string => typeof r === "string")
    : null
  if (roles === null) {
    // "No roles claim" and "no roles" are indistinguishable in the payload,
    // so the missing claim maps to isAdmin: null rather than false.
    logger?.warn(
      { sub },
      "keycloak id token has no usable realm_access.roles claim; admin status is unknown — check the client's realm-roles mapper"
    )
  }
  if (claims.email_verified === undefined) {
    // Same shape of failure as the roles claim: without the mapper every
    // login is refused as unverified, and the member's registry email is fine.
    logger?.warn(
      { sub },
      "keycloak id token has no email_verified claim; every login will be refused as unverified — check the client scope's mappers"
    )
  }
  const rawLocale = typeof claims.locale === "string" ? claims.locale : null
  return {
    sub,
    email,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : localpart,
    usernameSuggestion: localpart,
    // The app ships fi/en/se; anything else has no translations to fall back
    // on, so the user keeps whatever locale the browser negotiated.
    locale:
      rawLocale === "fi" || rawLocale === "en" || rawLocale === "se"
        ? rawLocale
        : null,
    isAdmin: roles === null ? null : roles.includes(ILMO_ADMIN_ROLE),
  }
}
