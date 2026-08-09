import fastifySecureSession from "@fastify/secure-session"
import { fastify, FastifyInstance } from "fastify"
import * as oidc from "openid-client"
import { Pool } from "pg"

import { resetKeycloakConfigForTests } from "../../src/middleware/installKeycloak"
import installPassport from "../../src/middleware/installPassport"

jest.mock("openid-client", () => ({
  discovery: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  allowInsecureRequests: Symbol("allowInsecureRequests"),
}))

const mockOidc = oidc as jest.Mocked<typeof oidc>

let app: FastifyInstance
let pool: Pool
const createdUserIds: string[] = []

const KEYCLOAK_ENV_KEYS = [
  "KEYCLOAK_ISSUER",
  "KEYCLOAK_CLIENT_ID",
  "KEYCLOAK_CLIENT_SECRET",
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const key of KEYCLOAK_ENV_KEYS) {
    savedEnv[key] = process.env[key]
  }
  process.env.KEYCLOAK_ISSUER =
    "http://localhost:8180/realms/membership-registry"
  process.env.KEYCLOAK_CLIENT_ID = "ilmokilke"
  process.env.KEYCLOAK_CLIENT_SECRET = "test-secret"
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
})

afterAll(async () => {
  for (const key of KEYCLOAK_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
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
  app.decorate("rootPgPool", pool)
  await app.register(installPassport)
  // Stands in for a login route: gives the test a session cookie the /logout
  // route sees as a live app session.
  app.get("/test-login", async (request, reply) => {
    await request.logIn({
      sessionId: (request.query as Record<string, string>).sessionId,
    })
    return reply.send("ok")
  })
  await app.ready()
})

afterEach(async () => {
  try {
    if (createdUserIds.length > 0) {
      await pool.query(
        `delete from app_public.users where id = any($1::uuid[])`,
        [createdUserIds]
      )
      createdUserIds.length = 0
    }
  } finally {
    await app.close()
  }
})

async function createUserWithSession(opts: { withKeycloakIdentity: boolean }) {
  const {
    rows: [user],
  } = await pool.query(
    `select id from app_private.really_create_user(
       username => $1, email => $2, name => $3, avatar_url => null,
       password => 'SuperSecret!123', email_is_verified => true,
       is_admin => false)`,
    [
      `forcelogout${opts.withKeycloakIdentity ? "sso" : "local"}`,
      `forcelogout${opts.withKeycloakIdentity ? "sso" : "local"}@example.com`,
      `forcelogout${opts.withKeycloakIdentity ? "sso" : "local"}`,
    ]
  )
  createdUserIds.push(user.id)
  if (opts.withKeycloakIdentity) {
    await pool.query(
      `with ua as (
         insert into app_public.user_authentications (user_id, service, identifier)
         values ($1, 'keycloak', 'kc-force-logout')
         returning id
       )
       insert into app_private.user_authentication_secrets (user_authentication_id, details)
       select id, '{"id_token": "stored-id-token"}'::jsonb from ua`,
      [user.id]
    )
  }
  const {
    rows: [session],
  } = await pool.query(
    `insert into app_private.sessions (user_id) values ($1) returning uuid`,
    [user.id]
  )
  const login = await app.inject({
    url: `/test-login?sessionId=${session.uuid}`,
  })
  const cookie = ([] as string[])
    .concat(login.headers["set-cookie"] as string | string[])
    .map((c) => c.split(";")[0])
    .join("; ")
  return { userId: user.id as string, cookie }
}

describe("GET /logout", () => {
  it("ends the keycloak session too when the user has one", async () => {
    // /login bounces straight back to Keycloak, so a surviving IdP session
    // would sign the next visitor on this browser right back in as this user.
    const { cookie } = await createUserWithSession({
      withKeycloakIdentity: true,
    })
    mockOidc.discovery.mockResolvedValue({} as any)
    mockOidc.buildEndSessionUrl.mockReturnValue(
      new URL("http://kc.test/logout?id_token_hint=stored-id-token")
    )
    const res = await app.inject({ url: "/logout", headers: { cookie } })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe(
      "http://kc.test/logout?id_token_hint=stored-id-token"
    )
    expect(mockOidc.buildEndSessionUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id_token_hint: "stored-id-token" })
    )
  })

  it("redirects home for a user without a keycloak identity", async () => {
    const { cookie } = await createUserWithSession({
      withKeycloakIdentity: false,
    })
    const res = await app.inject({ url: "/logout", headers: { cookie } })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/")
    expect(mockOidc.buildEndSessionUrl).not.toHaveBeenCalled()
  })

  it("redirects home for an anonymous visitor", async () => {
    const res = await app.inject({ url: "/logout" })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/")
  })

  it("still logs out locally when keycloak is unreachable", async () => {
    const { cookie } = await createUserWithSession({
      withKeycloakIdentity: true,
    })
    mockOidc.discovery.mockRejectedValue(new Error("connect ECONNREFUSED"))
    const res = await app.inject({ url: "/logout", headers: { cookie } })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/")
    // The passport session must be gone: a second /logout finds no user.
    const again = await app.inject({
      url: "/logout",
      headers: { cookie },
    })
    expect(again.headers.location).toBe("/")
  })
})
