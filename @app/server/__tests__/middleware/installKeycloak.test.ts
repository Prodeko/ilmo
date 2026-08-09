import fastifyPassport from "@fastify/passport"
import fastifySecureSession from "@fastify/secure-session"
import { fastify, FastifyInstance } from "fastify"
import * as oidc from "openid-client"
import { Pool } from "pg"

import installKeycloak, {
  buildKeycloakLogoutUrl,
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

function fakeTokens(claimOverrides: Record<string, unknown> = {}) {
  const claims = {
    sub: "kc-sub-1",
    email: "test.user@example.com",
    email_verified: true,
    name: "Test User",
    locale: "en",
    realm_access: { roles: ["membership"] },
    ...claimOverrides,
  }
  return { id_token: "fake-id-token", claims: () => claims } as any
}

// Replays the cookies a response set back as a request `cookie` header.
function cookieHeader(res: { headers: Record<string, unknown> }) {
  return ([] as string[])
    .concat(res.headers["set-cookie"] as string | string[])
    .map((c) => c.split(";")[0])
    .join("; ")
}

async function doCallback(
  claimOverrides: Record<string, unknown> = {},
  next = "/event/foo"
) {
  mockOidc.discovery.mockResolvedValue({} as any)
  mockOidc.buildAuthorizationUrl.mockReturnValue(new URL("http://kc.test/auth"))
  const login = await app.inject({ url: `/auth/keycloak?next=${next}` })
  mockOidc.authorizationCodeGrant.mockResolvedValue(fakeTokens(claimOverrides))
  return app.inject({
    url: "/auth/keycloak/callback?code=fake&state=test-state",
    headers: { cookie: cookieHeader(login) },
  })
}

describe("GET /auth/keycloak/callback", () => {
  it("creates a user, session, sso flag and locale cookie, then redirects to next", async () => {
    const res = await doCallback()
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/event/foo")
    const setCookies = ([] as string[]).concat(res.headers["set-cookie"]!)
    expect(setCookies.some((c) => c.startsWith("NEXT_LOCALE=en"))).toBe(true)
    const session = sessionFromResponse(res)!
    expect(session.get("sso")).toBe(true)
    const {
      rows: [ua],
    } = await pool.query(
      `select ua.user_id, u.username, u.is_admin
         from app_public.user_authentications ua
         join app_public.users u on u.id = ua.user_id
        where ua.service = 'keycloak' and ua.identifier = 'kc-sub-1'`
    )
    expect(ua).toBeTruthy()
    expect(ua.is_admin).toBe(false)
    const {
      rows: [secret],
    } = await pool.query(
      `select uas.details->>'id_token' as id_token
         from app_private.user_authentication_secrets uas
         join app_public.user_authentications ua on ua.id = uas.user_authentication_id
        where ua.identifier = 'kc-sub-1'`
    )
    expect(secret.id_token).toBe("fake-id-token")
    const {
      rows: [dbSession],
    } = await pool.query(
      `select * from app_private.sessions where user_id = $1`,
      [ua.user_id]
    )
    expect(dbSession).toBeTruthy()
    expect(session.get("passport")).toBe(dbSession.uuid)
  })

  it("stamps is_admin true when ilmo-admin role is present, and false again when it disappears", async () => {
    let res = await doCallback({
      realm_access: { roles: ["membership", "ilmo-admin"] },
    })
    expect(res.statusCode).toBe(302)
    let {
      rows: [user],
    } = await pool.query(
      `select u.is_admin from app_public.users u
         join app_public.user_authentications ua on ua.user_id = u.id
        where ua.identifier = 'kc-sub-1'`
    )
    expect(user.is_admin).toBe(true)
    res = await doCallback({ realm_access: { roles: ["membership"] } })
    expect(res.statusCode).toBe(302)
    ;({
      rows: [user],
    } = await pool.query(
      `select u.is_admin from app_public.users u
         join app_public.user_authentications ua on ua.user_id = u.id
        where ua.identifier = 'kc-sub-1'`
    ))
    expect(user.is_admin).toBe(false)
  })

  it("refuses unverified emails", async () => {
    const res = await doCallback({ email_verified: false })
    expect(res.headers.location).toBe("/login?error=email_not_verified")
    const { rowCount } = await pool.query(
      `select 1 from app_public.user_authentications where service = 'keycloak'`
    )
    expect(rowCount).toBe(0)
  })

  it("refuses logins that land on a break-glass row", async () => {
    await pool.query(
      `select app_private.really_create_user(
         username => 'ProdekoCTO', email => 'cto@prodeko.fi', name => 'CTO',
         avatar_url => null, password => 'SuperSecret!123', email_is_verified => true,
         is_admin => true)`
    )
    const res = await doCallback({ email: "cto@prodeko.fi" })
    expect(res.headers.location).toBe("/login?error=account_conflict")
    const {
      rows: [user],
    } = await pool.query(
      `select is_admin from app_public.users where username = 'ProdekoCTO'`
    )
    expect(user.is_admin).toBe(true) // untouched
    // The identity link that link_or_register_user created must be undone,
    // otherwise this Keycloak subject owns the break-glass account the moment
    // the username leaves the block list.
    const { rowCount } = await pool.query(
      `select 1 from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-1'`
    )
    expect(rowCount).toBe(0)
    const { rowCount: secretCount } = await pool.query(
      `select 1 from app_private.user_authentication_secrets uas
         join app_public.user_authentications ua
           on ua.id = uas.user_authentication_id
        where ua.identifier = 'kc-sub-1'`
    )
    expect(secretCount).toBe(0)
    await pool.query(
      `delete from app_public.users where username = 'ProdekoCTO'`
    )
  })

  it("rejects a callback with no oidc state in the session", async () => {
    const res = await app.inject({
      url: "/auth/keycloak/callback?code=fake&state=test-state",
    })
    expect(res.headers.location).toBe("/login?error=state_mismatch")
  })

  it("redirects with code_exchange_failed when the grant fails", async () => {
    mockOidc.discovery.mockResolvedValue({} as any)
    mockOidc.buildAuthorizationUrl.mockReturnValue(
      new URL("http://kc.test/auth")
    )
    const login = await app.inject({ url: "/auth/keycloak" })
    mockOidc.authorizationCodeGrant.mockRejectedValue(
      new Error("invalid_grant")
    )
    const res = await app.inject({
      url: "/auth/keycloak/callback?code=bad&state=test-state",
      headers: { cookie: cookieHeader(login) },
    })
    expect(res.headers.location).toBe("/login?error=code_exchange_failed")
  })

  it("consumes the oidc session key even when the login fails, so the code cannot be replayed", async () => {
    const failed = await doCallback({ email_verified: false })
    expect(failed.headers.location).toBe("/login?error=email_not_verified")
    expect(sessionFromResponse(failed)!.get("oidc")).toBeUndefined()
    // Replaying the same session against the callback now has no state to
    // match against.
    const replay = await app.inject({
      url: "/auth/keycloak/callback?code=fake&state=test-state",
      headers: { cookie: cookieHeader(failed) },
    })
    expect(replay.headers.location).toBe("/login?error=state_mismatch")
  })
})

describe("buildKeycloakLogoutUrl", () => {
  it("builds an end-session url from the stored id token", async () => {
    await doCallback() // seeds user + id_token
    const {
      rows: [ua],
    } = await pool.query(
      `select user_id from app_public.user_authentications where identifier = 'kc-sub-1'`
    )
    mockOidc.buildEndSessionUrl.mockReturnValue(
      new URL("http://kc.test/logout?id_token_hint=fake-id-token")
    )
    const url = await buildKeycloakLogoutUrl(pool, ua.user_id)
    expect(url).toBe("http://kc.test/logout?id_token_hint=fake-id-token")
    expect(mockOidc.buildEndSessionUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id_token_hint: "fake-id-token",
        post_logout_redirect_uri: `${process.env.ROOT_URL}/`,
      })
    )
  })

  it("returns null when the user has no keycloak identity", async () => {
    const {
      rows: [u],
    } = await pool.query(
      `select id from app_private.really_create_user(
         username => 'plainlocal', email => 'plain@example.com', name => 'Plain',
         avatar_url => null, password => 'SuperSecret!123', email_is_verified => true)`
    )
    expect(await buildKeycloakLogoutUrl(pool, u.id)).toBeNull()
    await pool.query(`delete from app_public.users where id = $1`, [u.id])
  })

  it("returns null instead of throwing when discovery fails", async () => {
    await doCallback()
    resetKeycloakConfigForTests()
    mockOidc.discovery.mockRejectedValue(new Error("down"))
    const {
      rows: [ua],
    } = await pool.query(
      `select user_id from app_public.user_authentications where identifier = 'kc-sub-1'`
    )
    expect(await buildKeycloakLogoutUrl(pool, ua.user_id)).toBeNull()
  })
})

describe("when Keycloak is not configured", () => {
  it("mounts no routes at all", async () => {
    const saved = {
      KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER,
      KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID,
      KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET,
    }
    delete process.env.KEYCLOAK_ISSUER
    delete process.env.KEYCLOAK_CLIENT_ID
    delete process.env.KEYCLOAK_CLIENT_SECRET
    const disabledApp = fastify()
    try {
      await disabledApp.register(installKeycloak)
      await disabledApp.ready()
      const login = await disabledApp.inject({ url: "/auth/keycloak" })
      expect(login.statusCode).toBe(404)
      const callback = await disabledApp.inject({
        url: "/auth/keycloak/callback",
      })
      expect(callback.statusCode).toBe(404)
    } finally {
      await disabledApp.close()
      Object.assign(process.env, saved)
    }
  })
})
