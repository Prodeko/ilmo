import { createServer, Server } from "http"
import { AddressInfo } from "net"

import { fastify, FastifyInstance } from "fastify"
import { exportJWK, generateKeyPair, JWTPayload, KeyLike, SignJWT } from "jose"

import {
  McpAuthError,
  mcpResourceUrl,
  verifyAccessToken,
} from "../../src/mcp/auth"
import { mcpRoutes } from "../../src/mcp/routes"
import installExternalRoutes from "../../src/middleware/installExternalRoutes"

let issuerServer: Server
let issuer: string
let signingKey: KeyLike
let foreignKey: KeyLike
let app: FastifyInstance
const savedIssuer = process.env.KEYCLOAK_ISSUER

beforeAll(async () => {
  const keys = await generateKeyPair("RS256")
  signingKey = keys.privateKey
  foreignKey = (await generateKeyPair("RS256")).privateKey
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "test",
    alg: "RS256",
  }

  // Stands in for Keycloak: the discovery document and the realm's JWKS.
  issuerServer = createServer((req, res) => {
    res.setHeader("content-type", "application/json")
    if (req.url === "/realms/test/.well-known/openid-configuration") {
      res.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/certs` }))
    } else if (req.url === "/realms/test/certs") {
      res.end(JSON.stringify({ keys: [jwk] }))
    } else {
      res.statusCode = 404
      res.end("{}")
    }
  })
  await new Promise<void>((resolve) =>
    issuerServer.listen(0, "127.0.0.1", resolve)
  )
  const { port } = issuerServer.address() as AddressInfo
  issuer = `http://127.0.0.1:${port}/realms/test`
  process.env.KEYCLOAK_ISSUER = issuer

  app = fastify()
  await app.register(mcpRoutes.register)
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await new Promise((resolve) => issuerServer.close(resolve))
  process.env.KEYCLOAK_ISSUER = savedIssuer
})

function token(
  overrides: JWTPayload = {},
  {
    key = signingKey,
    expiresIn = "5m",
  }: { key?: KeyLike; expiresIn?: string } = {}
) {
  return new SignJWT({
    typ: "Bearer",
    sub: "test-sub",
    sid: "test-sid",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer((overrides.iss as string) ?? issuer)
    .setAudience((overrides.aud as string) ?? mcpResourceUrl())
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key)
}

describe("verifyAccessToken", () => {
  it("accepts an access token issued for the MCP resource", async () => {
    const payload = await verifyAccessToken(await token())
    expect(payload).toMatchObject({ sub: "test-sub", sid: "test-sid" })
  })

  it.each([
    ["another audience", () => token({ aud: "https://other.prodeko.org" })],
    [
      "another issuer",
      () => token({ iss: "https://evil.example/realms/test" }),
    ],
    ["an ID token", () => token({ typ: "ID" })],
    ["an expired token", () => token({}, { expiresIn: "-1m" })],
    ["a token signed with another key", () => token({}, { key: foreignKey })],
  ])("rejects %s", async (_, make) => {
    await expect(verifyAccessToken(await make())).rejects.toBeInstanceOf(
      McpAuthError
    )
  })

  it("rejects a malformed token", async () => {
    await expect(verifyAccessToken("not-a-jwt")).rejects.toBeInstanceOf(
      McpAuthError
    )
  })
})

describe("/mcp routes", () => {
  const metadataUrl = `${process.env.ROOT_URL}/.well-known/oauth-protected-resource/mcp`

  it("serves protected resource metadata pointing at the issuer", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource/mcp",
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      resource: mcpResourceUrl(),
      authorization_servers: [issuer],
    })
  })

  it("answers a request without a token with 401 and the metadata pointer", async () => {
    const res = await app.inject({ method: "POST", url: "/mcp", payload: {} })
    expect(res.statusCode).toBe(401)
    expect(res.headers["www-authenticate"]).toBe(
      `Bearer resource_metadata="${metadataUrl}"`
    )
  })

  it("answers a token for another audience with invalid_token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {},
      headers: {
        authorization: `Bearer ${await token({ aud: "https://other.prodeko.org" })}`,
      },
    })
    expect(res.statusCode).toBe(401)
    expect(res.headers["www-authenticate"]).toContain('error="invalid_token"')
  })

  it.each(["GET", "DELETE"] as const)(
    "answers %s with 405 instead of holding the connection open",
    async (method) => {
      const res = await app.inject({ method, url: "/mcp" })
      expect(res.statusCode).toBe(405)
      expect(res.headers.allow).toBe("POST")
    }
  )
})

describe("the mcp_server flag", () => {
  const routes = [
    ["POST", "/mcp"],
    ["GET", "/mcp"],
    ["DELETE", "/mcp"],
    ["GET", "/.well-known/oauth-protected-resource/mcp"],
    ["GET", "/.well-known/oauth-protected-resource"],
  ] as const

  let gated: FastifyInstance
  let enabled: boolean
  // Stands in for the root pool: resolveMcpSession writes the session row
  // through it, which is the first side effect of an authenticated request.
  const connect = jest.fn(async () => {
    throw new Error("no database in this test")
  })

  beforeAll(async () => {
    gated = fastify()
    gated.decorate("rootPgPool", { connect } as any)
    await gated.register(installExternalRoutes, {
      externalRoutes: [mcpRoutes],
      isFeatureEnabled: async (key) => key === "mcp_server" && enabled,
    })
    await gated.ready()
  })

  afterAll(() => gated.close())

  beforeEach(() => connect.mockClear())

  it("names the mcp_server flag and declares every route the module registers", () => {
    expect(mcpRoutes.feature).toBe("mcp_server")
    expect(mcpRoutes.gateWhenOff).not.toBe(false)
    for (const [method, url] of routes) {
      expect(gated.hasRoute({ method, url })).toBe(true)
    }
  })

  it("answers 404 on every MCP route while the flag is off, and touches no session", async () => {
    enabled = false
    const authorization = `Bearer ${await token()}`
    for (const [method, url] of routes) {
      const res = await gated.inject({
        method,
        url,
        payload: method === "POST" ? {} : undefined,
        headers: { authorization },
      })
      expect([method, url, res.statusCode]).toEqual([method, url, 404])
      expect(res.headers["www-authenticate"]).toBeUndefined()
    }
    expect(connect).not.toHaveBeenCalled()
  })

  it("serves the MCP routes while the flag is on", async () => {
    enabled = true
    expect(
      (
        await gated.inject({
          method: "GET",
          url: "/.well-known/oauth-protected-resource/mcp",
        })
      ).statusCode
    ).toBe(200)
    expect(
      (await gated.inject({ method: "POST", url: "/mcp", payload: {} }))
        .statusCode
    ).toBe(401)
    expect(
      (await gated.inject({ method: "GET", url: "/mcp" })).statusCode
    ).toBe(405)

    // A valid token reaches session resolution, which needs the database.
    const res = await gated.inject({
      method: "POST",
      url: "/mcp",
      payload: {},
      headers: { authorization: `Bearer ${await token()}` },
    })
    expect(res.statusCode).toBe(503)
    expect(connect).toHaveBeenCalledTimes(1)
  })
})
