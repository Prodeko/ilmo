import { keycloakEnabled, sanitizeNext } from "@app/lib"
import { FastifyBaseLogger } from "fastify"

// The login page renders the same error codes and computes the same `next`,
// so both live in @app/lib; server code keeps importing them from here.
export { keycloakEnabled, sanitizeNext }

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
  readonly isAdmin: boolean
}

export function mapKeycloakClaims(
  claims: Record<string, unknown>,
  logger?: Pick<FastifyBaseLogger, "warn">
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
  if (realmAccess === undefined) {
    // A missing role claim is indistinguishable from "this user has no roles",
    // so a dropped realm_access mapper would quietly demote every admin.
    logger?.warn(
      { sub },
      "keycloak id token has no realm_access claim; every user will be mapped as non-admin"
    )
  }
  const roles = Array.isArray(realmAccess?.roles)
    ? realmAccess!.roles.filter((r): r is string => typeof r === "string")
    : []
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
    isAdmin: roles.includes(ILMO_ADMIN_ROLE),
  }
}
