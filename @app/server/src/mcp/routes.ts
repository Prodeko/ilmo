import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import { graphql, print } from "graphql"
import { PoolClient } from "pg"
import { withPostGraphileContext } from "postgraphile"

import { OurGraphQLContext } from "../middleware/installPostGraphile"

import {
  McpAuthError,
  mcpEnabled,
  mcpResourceUrl,
  resolveMcpSession,
  tokenGrantsAdmin,
  verifyAccessToken,
} from "./auth"
import { createMcpServer, GraphQLRunner, RunGraphQL, ToolError } from "./server"

import type { ExternalRouteModule } from "../externalRoutes"

const MCP_PATH = "/mcp"
const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource/mcp"
const PROTECTED_RESOURCE_METADATA_ROOT_PATH =
  "/.well-known/oauth-protected-resource"

function unauthorized(reply: FastifyReply, error?: McpAuthError) {
  const params = [
    `resource_metadata="${process.env.ROOT_URL}${PROTECTED_RESOURCE_METADATA_PATH}"`,
  ]
  if (error) {
    params.push(
      `error="${error.oauthError}"`,
      `error_description="${error.message.replace(/"/g, "'")}"`
    )
  }
  return reply
    .code(401)
    .header("WWW-Authenticate", `Bearer ${params.join(", ")}`)
    .send({ error: error?.oauthError ?? "unauthorized" })
}

const registerMcpRoutes: FastifyPluginAsync = async (app) => {
  // RFC 9728: tells the MCP client which authorization server issues tokens
  // for this resource. The root path serves the same document for clients
  // that do not insert the resource path.
  const protectedResourceMetadata = async () => ({
    resource: mcpResourceUrl(),
    authorization_servers: [process.env.KEYCLOAK_ISSUER],
    scopes_supported: ["openid", "profile", "email"],
    bearer_methods_supported: ["header"],
  })
  app.get(PROTECTED_RESOURCE_METADATA_PATH, protectedResourceMetadata)
  app.get(PROTECTED_RESOURCE_METADATA_ROOT_PATH, protectedResourceMetadata)

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null
    if (!token) return unauthorized(reply)

    let sessionId: string
    let isAdmin: boolean
    try {
      const claims = await verifyAccessToken(token)
      sessionId = await resolveMcpSession(app.rootPgPool, claims, request.log)
      isAdmin = tokenGrantsAdmin(claims)
    } catch (e) {
      if (e instanceof McpAuthError) return unauthorized(reply, e)
      request.log.error({ err: e }, "mcp: authentication failed")
      return reply.code(503).send({ error: "temporarily_unavailable" })
    }

    const schema = await app.postgraphile.getGraphQLSchema()
    const context: Omit<OurGraphQLContext, "pgClient"> = {
      sessionId,
      ipAddress: request.ip,
      rootPgPool: app.rootPgPool,
      redisClient: app.redis,
      workerUtils: app.workerUtils,
      login: async () => {
        throw new Error("login is not available over MCP")
      },
      logout: async () => {
        throw new Error("logout is not available over MCP")
      },
      isSsoSession: () => false,
      logger: request.log,
    }

    const runner: GraphQLRunner = {
      // withPostGraphileContext is typed for a GraphQL result but resolves to
      // whatever its callback returns.
      transaction: <T>(fn: (run: RunGraphQL) => Promise<T>) =>
        withPostGraphileContext(
          {
            pgPool: app.authPgPool,
            pgSettings: {
              role: process.env.DATABASE_VISITOR,
              "jwt.claims.session_id": sessionId,
            },
          },
          async (pgContext) => {
            // withPostGraphileContext commits even when the callback throws,
            // so a failed registration would keep the spot it just claimed.
            // Rolling back to this savepoint leaves the commit nothing to do.
            const { pgClient } = pgContext as { pgClient: PoolClient }
            await pgClient.query("savepoint mcp_transaction")
            try {
              return (await fn(async (document, variables) => {
                const result = await graphql({
                  schema,
                  source: print(document),
                  contextValue: { ...pgContext, ...context },
                  variableValues: variables,
                })
                if (result.errors?.length) {
                  // Database and plugin errors carry the user-facing message
                  // the web form shows; anything else stays in the log.
                  const [error] = result.errors
                  request.log.warn({ err: error }, "mcp: graphql error")
                  throw new ToolError(error.message)
                }
                return result.data as any
              })) as any
            } catch (e) {
              await pgClient.query("rollback to savepoint mcp_transaction")
              throw e
            }
          }
        ) as Promise<T>,
    }

    const server = createMcpServer(runner, { isAdmin })
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    reply.raw.on("close", () => {
      transport.close()
      server.close()
    })
    reply.hijack()
    await server.connect(transport)
    await transport.handleRequest(request.raw, reply.raw, request.body)
  }

  app.post(MCP_PATH, handler)

  // The server is stateless: there is no standalone SSE stream to open and no
  // session to delete. Handing GET to the transport left the request hanging
  // without a status line, which clients such as claude.ai report as an error.
  const methodNotAllowed = async (_: FastifyRequest, reply: FastifyReply) =>
    reply
      .code(405)
      .header("Allow", "POST")
      .send({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      })
  app.get(MCP_PATH, methodNotAllowed)
  app.delete(MCP_PATH, methodNotAllowed)
}

/**
 * The MCP endpoint and its OAuth protected resource metadata. Registered by
 * installExternalRoutes when Keycloak is configured; the routes answer 404
 * while the `mcp_server` flag is off.
 */
export const mcpRoutes: ExternalRouteModule = {
  name: "mcp",
  paths: [
    // Authenticates with a Keycloak bearer token and never reads the session
    // cookie, so there is no ambient credential for a cross-site request to
    // ride on.
    { method: "POST", path: MCP_PATH, csrfExempt: true },
    { method: "GET", path: MCP_PATH },
    { method: "DELETE", path: MCP_PATH },
    { method: "GET", path: PROTECTED_RESOURCE_METADATA_PATH },
    { method: "GET", path: PROTECTED_RESOURCE_METADATA_ROOT_PATH },
  ],
  configured: mcpEnabled,
  feature: "mcp_server",
  register: registerMcpRoutes,
}
