import fastifyPassport from "@fastify/passport"
import fastifySecureSession from "@fastify/secure-session"
import { fastify, FastifyInstance } from "fastify"
import * as oidc from "openid-client"
import { Pool } from "pg"

import installKeycloak, {
  OidcSessionData,
  resetKeycloakConfigForTests,
} from "../../src/middleware/installKeycloak"

jest.mock("openid-client", () => ({
  discovery: jest.fn(),
  randomPKCECodeVerifier: jest.fn(() => "test-verifier"),
  calculatePKCECodeChallenge: jest.fn(async () => "test-challenge"),
  randomState: jest.fn(() => "test-state"),
  randomNonce: jest.fn(() => "test-nonce"),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  allowInsecureRequests: Symbol("allowInsecureRequests"),
}))

const mockOidc = oidc as jest.Mocked<typeof oidc>

let app: FastifyInstance
let pool: Pool

function sessionFromResponse(res: {
  cookies: Array<{ name: string; value: string }>
}) {
  const cookie = res.cookies.find((c) => c.name === "session")
  if (!cookie) {
    throw new Error("no session cookie was set")
  }
  return app.decodeSecureSession(cookie.value)
}

beforeAll(() => {
  process.env.KEYCLOAK_ISSUER =
    "http://localhost:8180/realms/membership-registry"
  process.env.KEYCLOAK_CLIENT_ID = "ilmokilke"
  process.env.KEYCLOAK_CLIENT_SECRET = "test-secret"
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
})

afterAll(async () => {
  await pool.end()
})

beforeEach(async () => {
  jest.clearAllMocks()
  resetKeycloakConfigForTests()
  app = fastify()
  app.register(fastifySecureSession, {
    key: Buffer.from(process.env.SECRET!, "hex"),
    cookie: { path: "/", httpOnly: true, sameSite: "lax", secure: false },
  })
  fastifyPassport.registerUserSerializer<{ sessionId: string }, string>(
    async (user) => user?.sessionId
  )
  fastifyPassport.registerUserDeserializer(async (id: string) => ({
    sessionId: id,
  }))
  app.register(fastifyPassport.initialize())
  app.register(fastifyPassport.secureSession())
  // Matches the decoration added by installDatabasePools
  app.decorate("rootPgPool", pool)
  await app.register(installKeycloak)
  await app.ready()
})

afterEach(async () => {
  await pool.query(
    `delete from app_public.users
      where id in (select user_id from app_public.user_authentications
                    where service = 'keycloak')`
  )
  await app.close()
})

describe("GET /auth/keycloak", () => {
  it("redirects to the authorization URL and stores oidc state in the session", async () => {
    mockOidc.discovery.mockResolvedValue({} as any)
    mockOidc.buildAuthorizationUrl.mockReturnValue(
      new URL(
        "http://localhost:8180/realms/membership-registry/protocol/openid-connect/auth?state=test-state"
      )
    )
    const res = await app.inject({ url: "/auth/keycloak?next=/event/foo" })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain("/protocol/openid-connect/auth")
    expect(mockOidc.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        redirect_uri: `${process.env.ROOT_URL}/auth/keycloak/callback`,
        scope: "openid profile email",
        code_challenge: "test-challenge",
        code_challenge_method: "S256",
        state: "test-state",
        nonce: "test-nonce",
      })
    )
    expect(res.headers["set-cookie"]).toBeDefined()
    const session = sessionFromResponse(res)
    expect(session!.get("oidc")).toEqual<OidcSessionData>({
      verifier: "test-verifier",
      state: "test-state",
      nonce: "test-nonce",
      next: "/event/foo",
    })
  })

  it("sanitizes the next parameter before storing it", async () => {
    mockOidc.discovery.mockResolvedValue({} as any)
    mockOidc.buildAuthorizationUrl.mockReturnValue(
      new URL("http://kc.test/auth")
    )
    const res = await app.inject({
      url: "/auth/keycloak?next=//evil.example.com",
    })
    expect(sessionFromResponse(res)!.get("oidc")!.next).toBe("/")
  })

  it("redirects to /login?error=sso_unavailable when discovery fails", async () => {
    mockOidc.discovery.mockRejectedValue(new Error("connect ECONNREFUSED"))
    const res = await app.inject({ url: "/auth/keycloak" })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/login?error=sso_unavailable")
  })

  it("retries discovery after a failure", async () => {
    mockOidc.discovery.mockRejectedValueOnce(new Error("boom"))
    await app.inject({ url: "/auth/keycloak" })
    mockOidc.discovery.mockResolvedValue({} as any)
    mockOidc.buildAuthorizationUrl.mockReturnValue(
      new URL("http://kc.test/auth")
    )
    const res = await app.inject({ url: "/auth/keycloak" })
    expect(res.headers.location).toBe("http://kc.test/auth")
    expect(mockOidc.discovery).toHaveBeenCalledTimes(2)
  })
})
