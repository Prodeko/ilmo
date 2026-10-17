import { createRemoteJWKSet, JWTPayload, jwtVerify } from "jose"
import { Pool, PoolClient } from "pg"

import {
  BREAK_GLASS_USERNAMES,
  ILMO_ADMIN_ROLE,
  mapKeycloakClaims,
  RequestLogger,
} from "../utils/keycloak"

export class McpAuthError extends Error {
  constructor(
    message: string,
    readonly oauthError:
      | "invalid_token"
      | "insufficient_scope" = "invalid_token"
  ) {
    super(message)
  }
}

export function mcpResourceUrl() {
  return `${process.env.ROOT_URL}/mcp`
}

export function mcpEnabled() {
  return !!process.env.KEYCLOAK_ISSUER
}

/**
 * Admin tools require the realm role in the token itself, so revoking it in
 * Keycloak takes effect on the next request. The database's own is_admin
 * check still applies on top. MCP never writes is_admin: ilmo-mcp does not
 * have full scope, so a missing role scope mapping would otherwise demote
 * every admin.
 */
export function tokenGrantsAdmin(claims: JWTPayload) {
  const roles = (claims.realm_access as { roles?: unknown } | undefined)?.roles
  return Array.isArray(roles) && roles.includes(ILMO_ADMIN_ROLE)
}

type Jwks = ReturnType<typeof createRemoteJWKSet>
let jwksPromise: Promise<Jwks> | null = null

/**
 * Lazy, memoized discovery like getKeycloakConfig: a Keycloak outage must not
 * stop the server from booting, and a failed attempt is retried on the next
 * request. The web login's discovery is not reused because it needs the web
 * client's credentials, which /mcp has no business depending on.
 */
function getJwks(): Promise<Jwks> {
  if (!jwksPromise) {
    const issuer = process.env.KEYCLOAK_ISSUER!
    jwksPromise = fetch(`${issuer}/.well-known/openid-configuration`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`keycloak discovery failed with HTTP ${res.status}`)
        }
        const metadata = (await res.json()) as {
          issuer?: string
          jwks_uri?: string
        }
        if (metadata.issuer !== issuer || !metadata.jwks_uri) {
          throw new Error("keycloak discovery document does not match issuer")
        }
        return createRemoteJWKSet(new URL(metadata.jwks_uri))
      })
      .catch((e) => {
        jwksPromise = null
        throw e
      })
  }
  return jwksPromise
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const jwks = await getJwks()
  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, jwks, {
      issuer: process.env.KEYCLOAK_ISSUER!,
      audience: mcpResourceUrl(),
    }))
  } catch {
    throw new McpAuthError("The access token is invalid or expired.")
  }
  // Keycloak marks access tokens with typ Bearer; an ID token or refresh token
  // that somehow carried our audience must still not authenticate.
  if (payload.typ !== "Bearer") {
    throw new McpAuthError("The token is not an access token.")
  }
  return payload
}

async function resolveUserId(
  client: PoolClient,
  claims: JWTPayload,
  logger: RequestLogger
): Promise<string> {
  const sub = claims.sub!
  const {
    rows: [linked],
  } = await client.query<{ user_id: string }>(
    `select user_id from app_public.user_authentications
      where service = 'keycloak' and identifier = $1`,
    [sub]
  )
  // An already linked identity must not go through link_or_register_user:
  // that function overwrites the stored auth secrets, which hold the web
  // login's id token used as the Keycloak logout hint.
  if (linked) return linked.user_id

  let profile
  try {
    profile = mapKeycloakClaims(claims as Record<string, unknown>, logger)
  } catch {
    throw new McpAuthError(
      "The access token is missing the email claim; check the ilmo-mcp client scopes."
    )
  }
  if (!profile.emailVerified) {
    throw new McpAuthError(
      "Your Prodeko account email address is not verified."
    )
  }
  const {
    rows: [user],
  } = await client.query<{ id: string }>(
    `select id from app_private.link_or_register_user($1, $2, $3, $4, $5)`,
    [
      null,
      "keycloak",
      sub,
      JSON.stringify({
        username: profile.usernameSuggestion,
        email: profile.email,
        name: profile.name,
      }),
      JSON.stringify({}),
    ]
  )
  return user.id
}

/**
 * Maps a verified access token to an app_private.sessions row, creating the
 * user on first use exactly like the web SSO callback would. The session id
 * never leaves the server.
 */
export async function resolveMcpSession(
  rootPgPool: Pool,
  claims: JWTPayload,
  logger: RequestLogger
): Promise<string> {
  const sid = typeof claims.sid === "string" ? claims.sid : null
  if (!claims.sub || !sid) {
    throw new McpAuthError("The access token has no sub or sid claim.")
  }

  const client = await rootPgPool.connect()
  let rollbackFailed = false
  try {
    await client.query("begin")
    const userId = await resolveUserId(client, claims, logger)

    const {
      rows: [user],
    } = await client.query<{ username: string }>(
      "select username from app_public.users where id = $1",
      [userId]
    )
    if (BREAK_GLASS_USERNAMES.includes(String(user.username).toLowerCase())) {
      logger.error(
        { userId, sub: claims.sub },
        "mcp: refusing a keycloak identity that resolves to a break-glass account"
      )
      throw new McpAuthError("This account cannot use the MCP server.")
    }

    const {
      rows: [session],
    } = await client.query<{ uuid: string; user_id: string }>(
      `insert into app_private.sessions (user_id, kind, oauth_sid)
        values ($1, 'mcp', $2)
        on conflict (oauth_sid) where kind = 'mcp'
          do update set last_active = now()
        returning uuid, user_id`,
      [userId, sid]
    )
    if (session.user_id !== userId) {
      throw new McpAuthError("The Keycloak session belongs to another user.")
    }
    await client.query("commit")
    return session.uuid
  } catch (e) {
    try {
      await client.query("rollback")
    } catch (rollbackError) {
      rollbackFailed = true
      logger.error({ err: rollbackError }, "mcp: session rollback failed")
    }
    throw e
  } finally {
    client.release(rollbackFailed)
  }
}
