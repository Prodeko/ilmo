/**
 * Vocabulary shared by the Keycloak SSO flow's two halves: the server
 * redirects to `/login?error=<code>` and the login page renders the matching
 * message. Both sides import from here so the code list stays a single
 * compile-checked definition.
 */
export type SsoLoginError =
  | "sso_unavailable"
  | "state_mismatch"
  | "code_exchange_failed"
  | "email_not_verified"
  | "missing_claims"
  | "account_conflict"
  | "login_failed"

/**
 * Anything outside this list arrived on the query string from somewhere other
 * than our own redirect, so the login page treats it as untrusted input.
 */
export const KNOWN_SSO_ERRORS: readonly SsoLoginError[] = [
  "sso_unavailable",
  "state_mismatch",
  "code_exchange_failed",
  "email_not_verified",
  "missing_claims",
  "account_conflict",
  "login_failed",
]

/**
 * A post-login destination is only accepted when it is a path on this origin,
 * and never one that leads back into the auth flow or straight to logout.
 * "/login" is in the list because a signed-in visit to /auth/keycloak
 * redirects to `next`, so `next=/login` would bounce between the two forever.
 */
const BLOCKED_REDIRECT_PATHS = /^\/+(|auth.*|login|logout)(\?.*)?$/

export function sanitizeNext(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "/"
  // Browsers strip tab/CR/LF and treat "\" as "/" when parsing a URL, so
  // "/\evil.com" and "/<TAB>/evil.com" both resolve to another origin.
  const candidate = raw.replace(/[\t\r\n]/g, "")
  // A single leading slash followed by something that is neither "/" nor "\".
  // Also rejects "" and a bare "/", both of which mean "no destination".
  if (!/^\/[^/\\]/.test(candidate)) return "/"
  // Remaining control characters have no place in a Location header.
  // eslint-disable-next-line no-control-regex -- matching them is the point
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return "/"
  if (BLOCKED_REDIRECT_PATHS.test(candidate)) return "/"
  return candidate
}

/**
 * SSO is on only when the whole client credential triple is present; a
 * partial configuration is a misconfiguration, not a half-enabled feature.
 */
export function keycloakEnabled(): boolean {
  return !!(
    process.env.KEYCLOAK_ISSUER &&
    process.env.KEYCLOAK_CLIENT_ID &&
    process.env.KEYCLOAK_CLIENT_SECRET
  )
}
