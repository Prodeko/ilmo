export const ILMO_ADMIN_ROLE = "ilmo-admin"

// Local accounts kept for break-glass access; an SSO login must never link
// onto (or flip is_admin on) these rows. Compared lowercase (username is citext).
export const BREAK_GLASS_USERNAMES = ["prodekocto", "prodekotoimari"]

export interface KeycloakProfile {
  sub: string
  email: string
  emailVerified: boolean
  name: string
  username: string
  locale: "fi" | "en" | null
  isAdmin: boolean
}

export function keycloakEnabled(): boolean {
  return !!(
    process.env.KEYCLOAK_ISSUER &&
    process.env.KEYCLOAK_CLIENT_ID &&
    process.env.KEYCLOAK_CLIENT_SECRET
  )
}

export function mapKeycloakClaims(
  claims: Record<string, unknown>
): KeycloakProfile {
  const sub = typeof claims.sub === "string" ? claims.sub : null
  const email = typeof claims.email === "string" ? claims.email : null
  if (!sub || !email) {
    const e = new Error("ID token is missing required sub/email claims")
    e["code"] = "KCCLM"
    throw e
  }
  const localpart = email.split("@")[0]
  const realmAccess = claims.realm_access as { roles?: unknown } | undefined
  const roles = Array.isArray(realmAccess?.roles)
    ? realmAccess!.roles.filter((r): r is string => typeof r === "string")
    : []
  const rawLocale = typeof claims.locale === "string" ? claims.locale : null
  return {
    sub,
    email,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : localpart,
    username: localpart,
    locale: rawLocale === "fi" || rawLocale === "en" ? rawLocale : null,
    isAdmin: roles.includes(ILMO_ADMIN_ROLE),
  }
}

// Same rules as the legacy setReturnTo: relative paths only, and never
// redirect back into the auth flow or logout.
const BLOCKED_REDIRECT_PATHS = /^\/+(|auth.*|logout)(\?.*)?$/

export function sanitizeNext(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    raw[0] !== "/" ||
    raw[1] === "/" || // reject protocol-relative URLs like //evil.example.com
    BLOCKED_REDIRECT_PATHS.test(raw)
  ) {
    return "/"
  }
  return raw
}
