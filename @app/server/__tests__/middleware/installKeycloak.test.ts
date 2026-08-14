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
import { BREAK_GLASS_USERNAMES } from "../../src/utils/keycloak"

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
  // The callback branches on this class (user pressed Cancel at the
  // provider), so the mock has to expose a real constructor for instanceof.
  AuthorizationResponseError: class AuthorizationResponseError extends Error {
    error: string
    constructor(error: string) {
      super(`authorization response error: ${error}`)
      this.error = error
    }
  },
}))

const mockOidc = oidc as jest.Mocked<typeof oidc>

const CALLBACK_URL = "/auth/keycloak/callback?code=fake&state=test-state"

let app: FastifyInstance
let pool: Pool

// Users this file creates directly; torn down after every test so a failed
// assertion cannot leave rows that break the next one.
const createdUserIds: string[] = []

function sessionFromResponse(res: {
  cookies: Array<{ name: string; value: string }>
}) {
  const cookie = res.cookies.find((c) => c.name === "session")
  if (!cookie) {
    throw new Error("no session cookie was set")
  }
  return app.decodeSecureSession(cookie.value)
}

/**
 * A `cookie` request header carrying a session the test built by hand. The
 * encoded session is base64, so it has to be percent-encoded exactly as
 * @fastify/cookie serializes it or the server reads back an empty session.
 */
function sessionCookie(
  session: ReturnType<FastifyInstance["decodeSecureSession"]>
) {
  return `session=${encodeURIComponent(app.encodeSecureSession(session!))}`
}

const KEYCLOAK_ENV_KEYS = [
  "KEYCLOAK_ISSUER",
  "KEYCLOAK_CLIENT_ID",
  "KEYCLOAK_CLIENT_SECRET",
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeAll(() => {
  // jest shares the process between test files in a worker, so the env has to
  // go back exactly as it was found.
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
  fastifyPassport.registerUserSerializer<{ sessionId: string }, string>(
    async (user) => user?.sessionId
  )
  fastifyPassport.registerUserDeserializer(async (id: string) => ({
    sessionId: id,
  }))
  app.register(fastifyPassport.initialize())
  app.register(fastifyPassport.secureSession())
  // Stands in for the password login route: gives the test a session cookie
  // that the SSO routes see as a live app session.
  app.get("/test-login", async (request, reply) => {
    await request.logIn({
      sessionId: (request.query as Record<string, string>).sessionId,
    })
    return reply.send("ok")
  })
  // Matches the decoration added by installDatabasePools
  app.decorate("rootPgPool", pool)
  await app.register(installKeycloak)
  await app.ready()
})

afterEach(async () => {
  try {
    await pool.query(
      `delete from app_public.users
        where id in (select user_id from app_public.user_authentications
                      where service = 'keycloak')`
    )
    if (createdUserIds.length > 0) {
      await pool.query(
        `delete from app_public.users where id = any($1::uuid[])`,
        [createdUserIds]
      )
      createdUserIds.length = 0
    }
    // The orphan break-glass test asserts these never appear; delete anyway so
    // a regression there does not cascade into every later run.
    await pool.query(`delete from app_public.users where username = any($1)`, [
      BREAK_GLASS_USERNAMES,
    ])
  } finally {
    await app.close()
  }
})

async function createLocalUser(opts: {
  username: string
  email: string
  isAdmin?: boolean
}) {
  const {
    rows: [user],
  } = await pool.query(
    `select id from app_private.really_create_user(
       username => $1, email => $2, name => $3, avatar_url => null,
       password => 'SuperSecret!123', email_is_verified => true,
       is_admin => $4)`,
    [opts.username, opts.email, opts.username, opts.isAdmin ?? false]
  )
  createdUserIds.push(user.id)
  return user.id as string
}

/** Response carrying a live app session cookie for `userId`. */
async function loginAs(userId: string) {
  const {
    rows: [session],
  } = await pool.query(
    `insert into app_private.sessions (user_id) values ($1) returning uuid`,
    [userId]
  )
  return app.inject({ url: `/test-login?sessionId=${session.uuid}` })
}

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

// The link intent only counts on a same-origin navigation, which real
// browsers mark with this header; link tests must send it explicitly.
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" }

async function startLogin(
  query = "",
  cookie?: string,
  headers: Record<string, string> = {}
) {
  mockOidc.discovery.mockResolvedValue({} as any)
  mockOidc.buildAuthorizationUrl.mockReturnValue(new URL("http://kc.test/auth"))
  return app.inject({
    url: `/auth/keycloak${query ? `?${query}` : ""}`,
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  })
}

async function finishLogin(
  login: { headers: Record<string, unknown> },
  claimOverrides: Record<string, unknown> = {}
) {
  mockOidc.authorizationCodeGrant.mockResolvedValue(fakeTokens(claimOverrides))
  return app.inject({
    url: CALLBACK_URL,
    headers: { cookie: cookieHeader(login) },
  })
}

async function doCallback(
  claimOverrides: Record<string, unknown> = {},
  next = "/event/foo"
) {
  const login = await startLogin(`next=${encodeURIComponent(next)}`)
  return finishLogin(login, claimOverrides)
}

describe("GET /auth/keycloak", () => {
  it("redirects to the authorization URL and stores oidc state in the session", async () => {
    mockOidc.discovery.mockResolvedValue({} as any)
    mockOidc.buildAuthorizationUrl.mockReturnValue(
      new URL(
        "http://localhost:8180/realms/membership-registry/protocol/openid-connect/auth?state=test-state"
      )
    )
    const res = await app.inject({
      url: `/auth/keycloak?next=${encodeURIComponent("/event/foo")}`,
    })
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

  it("records the link intent only when link=1 is present", async () => {
    const userId = await createLocalUser({
      username: "linkintent",
      email: "linkintent@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    const res = await startLogin(
      `link=1&next=${encodeURIComponent("/settings/accounts")}`,
      cookie,
      SAME_ORIGIN
    )
    expect(res.headers.location).toBe("http://kc.test/auth")
    expect(sessionFromResponse(res)!.get("oidc")!.link).toBe(true)

    const plain = await startLogin(`next=${encodeURIComponent("/event/foo")}`)
    expect(sessionFromResponse(plain)!.get("oidc")!.link).toBeUndefined()
  })

  it("refuses a link intent that did not arrive on a same-origin navigation", async () => {
    const userId = await createLocalUser({
      username: "crosssite",
      email: "crosssite@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    // A cross-site top-level navigation: sec-fetch-site says so. The refusal
    // must be visible — a silent redirect to `next` reads as "linked" to the
    // user — and must not degrade into a plain login round trip.
    const crossSite = await startLogin(
      `link=1&next=${encodeURIComponent("/event/foo")}`,
      cookie,
      { "sec-fetch-site": "cross-site" }
    )
    expect(crossSite.statusCode).toBe(302)
    expect(crossSite.headers.location).toBe(
      "/settings/accounts?linkError=intent"
    )
    expect(mockOidc.buildAuthorizationUrl).not.toHaveBeenCalled()

    // No sec-fetch-site and no referer is just as unverifiable.
    const headerless = await startLogin(
      `link=1&next=${encodeURIComponent("/event/foo")}`,
      cookie
    )
    expect(headerless.headers.location).toBe(
      "/settings/accounts?linkError=intent"
    )

    // A foreign-origin referer must not vouch for the navigation: with
    // sec-fetch-site absent it is the only check standing between a
    // cross-site page and a forged link intent.
    const foreignReferer = await startLogin(
      `link=1&next=${encodeURIComponent("/event/foo")}`,
      cookie,
      { referer: "https://evil.example.com/attack" }
    )
    expect(foreignReferer.headers.location).toBe(
      "/settings/accounts?linkError=intent"
    )
    expect(mockOidc.buildAuthorizationUrl).not.toHaveBeenCalled()
  })

  it("refuses a link intent when there is no live session to link onto", async () => {
    // No session at all: there is no account to bind the identity to, and
    // falling through to a plain login would sign the user into (or create)
    // a different account than the one they meant to extend.
    const anonymous = await startLogin(
      `link=1&next=${encodeURIComponent("/settings/accounts")}`,
      undefined,
      SAME_ORIGIN
    )
    expect(anonymous.headers.location).toBe("/login?error=link_session_lost")
    expect(mockOidc.buildAuthorizationUrl).not.toHaveBeenCalled()

    // A stale cookie is the same case, reachable by construction: the session
    // row died while the settings page was open.
    const userId = await createLocalUser({
      username: "stalelink",
      email: "stalelink@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    await pool.query(`delete from app_private.sessions where user_id = $1`, [
      userId,
    ])
    const stale = await startLogin(
      `link=1&next=${encodeURIComponent("/settings/accounts")}`,
      cookie,
      SAME_ORIGIN
    )
    expect(stale.headers.location).toBe("/login?error=link_session_lost")
    expect(mockOidc.buildAuthorizationUrl).not.toHaveBeenCalled()
  })

  it("accepts a link intent vouched for by a same-origin referer", async () => {
    const userId = await createLocalUser({
      username: "referrer",
      email: "referrer@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    const res = await startLogin(
      `link=1&next=${encodeURIComponent("/settings/accounts")}`,
      cookie,
      { referer: `${process.env.ROOT_URL}/settings/accounts` }
    )
    expect(res.headers.location).toBe("http://kc.test/auth")
    expect(sessionFromResponse(res)!.get("oidc")!.link).toBe(true)
  })

  it("starts a fresh OIDC login when the session cookie is stale", async () => {
    const userId = await createLocalUser({
      username: "stalecookie",
      email: "stalecookie@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    // The cookie survives the row it points at; a short-circuit on it alone
    // would bounce /login <-> /auth/keycloak forever.
    await pool.query(`delete from app_private.sessions where user_id = $1`, [
      userId,
    ])
    const res = await startLogin(
      `next=${encodeURIComponent("/event/foo")}`,
      cookie
    )
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("http://kc.test/auth")
    expect(mockOidc.buildAuthorizationUrl).toHaveBeenCalled()
  })

  it("does not start OIDC for a logged-in user without link=1", async () => {
    const userId = await createLocalUser({
      username: "alreadyin",
      email: "alreadyin@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    const res = await app.inject({
      url: `/auth/keycloak?next=${encodeURIComponent("/event/foo")}`,
      headers: { cookie },
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/event/foo")
    expect(mockOidc.discovery).not.toHaveBeenCalled()
    expect(mockOidc.buildAuthorizationUrl).not.toHaveBeenCalled()
  })

  it("sanitizes the next parameter before storing it", async () => {
    const res = await startLogin(
      `next=${encodeURIComponent("//evil.example.com")}`
    )
    expect(sessionFromResponse(res)!.get("oidc")!.next).toBe("/")
  })

  it("redirects to /login?error=sso_unavailable when discovery fails", async () => {
    mockOidc.discovery.mockRejectedValue(new Error("connect ECONNREFUSED"))
    const res = await app.inject({ url: "/auth/keycloak" })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/login?error=sso_unavailable")
  })

  it("redirects to /login?error=sso_unavailable when building the authorization url throws", async () => {
    mockOidc.discovery.mockResolvedValue({} as any)
    mockOidc.buildAuthorizationUrl.mockImplementation(() => {
      throw new Error("bad configuration")
    })
    const res = await app.inject({ url: "/auth/keycloak" })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/login?error=sso_unavailable")
  })

  it("retries discovery after a failure", async () => {
    mockOidc.discovery.mockRejectedValueOnce(new Error("boom"))
    await app.inject({ url: "/auth/keycloak" })
    const res = await startLogin()
    expect(res.headers.location).toBe("http://kc.test/auth")
    expect(mockOidc.discovery).toHaveBeenCalledTimes(2)
  })

  // The gate on allowInsecureRequests is what keeps the client secret off a
  // cleartext wire in production; each of the three cases is pinned because
  // inverting the boolean, or dropping the NODE_ENV term, must fail a test.
  describe("plaintext-http gate on discovery", () => {
    // NODE_ENV is typed read-only in the project env typings; the gate reads
    // it at discovery time, so the test has to write through a cast.
    const env = process.env as Record<string, string | undefined>
    const savedNodeEnv = env.NODE_ENV
    afterEach(() => {
      env.NODE_ENV = savedNodeEnv
      process.env.KEYCLOAK_ISSUER =
        "http://localhost:8180/realms/membership-registry"
    })

    it("allows insecure requests for an http issuer outside production", async () => {
      await startLogin()
      expect(mockOidc.discovery).toHaveBeenCalledWith(
        expect.anything(),
        "ilmokilke",
        "test-secret",
        undefined,
        { execute: [mockOidc.allowInsecureRequests] }
      )
    })

    it("does not allow insecure requests for an http issuer in production", async () => {
      env.NODE_ENV = "production"
      resetKeycloakConfigForTests()
      await startLogin()
      expect(mockOidc.discovery).toHaveBeenCalledWith(
        expect.anything(),
        "ilmokilke",
        "test-secret",
        undefined,
        undefined
      )
    })

    it("does not allow insecure requests for an https issuer", async () => {
      process.env.KEYCLOAK_ISSUER =
        "https://id.prodeko.org/realms/membership-registry"
      resetKeycloakConfigForTests()
      await startLogin()
      expect(mockOidc.discovery).toHaveBeenCalledWith(
        expect.anything(),
        "ilmokilke",
        "test-secret",
        undefined,
        undefined
      )
    })
  })
})

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

  it("exchanges the code against the pkce verifier, state and nonce held in the session", async () => {
    const login = await startLogin(`next=${encodeURIComponent("/event/foo")}`)
    const stored = sessionFromResponse(login)!.get("oidc")!
    const res = await finishLogin(login)
    expect(res.headers.location).toBe("/event/foo")

    expect(mockOidc.authorizationCodeGrant).toHaveBeenCalledTimes(1)
    const [, currentUrl, checks] = mockOidc.authorizationCodeGrant.mock
      .calls[0] as unknown as [unknown, URL, Record<string, unknown>]
    // The grant has to be checked against the URL the browser actually came
    // back to, resolved against our own origin rather than any Host header.
    expect(currentUrl.href).toBe(`${process.env.ROOT_URL}${CALLBACK_URL}`)
    // Dropping any of these silently disables PKCE / CSRF / replay protection,
    // so they are pinned to the exact values the authorize step stored.
    expect(checks).toEqual({
      pkceCodeVerifier: stored.verifier,
      expectedState: stored.state,
      expectedNonce: stored.nonce,
      idTokenExpected: true,
    })
    expect(stored.verifier).toBe("test-verifier")
    expect(stored.state).toBe("test-state")
    expect(stored.nonce).toBe("test-nonce")
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

  it("leaves is_admin untouched when the id token has no realm_access claim", async () => {
    // A dropped realm-roles mapper makes the roles unknown, which must not
    // read as "not an admin": stamping false here would demote every admin
    // one login at a time with nothing visible to the user.
    let res = await doCallback({
      realm_access: { roles: ["membership", "ilmo-admin"] },
    })
    expect(res.statusCode).toBe(302)
    res = await doCallback({ realm_access: undefined })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/event/foo") // login still works
    const {
      rows: [user],
    } = await pool.query(
      `select u.is_admin from app_public.users u
         join app_public.user_authentications ua on ua.user_id = u.id
        where ua.identifier = 'kc-sub-1'`
    )
    expect(user.is_admin).toBe(true)
  })

  it("sends a cancelled sign-in home without an error", async () => {
    const login = await startLogin()
    mockOidc.authorizationCodeGrant.mockRejectedValue(
      new (oidc.AuthorizationResponseError as any)("access_denied")
    )
    const res = await app.inject({
      url: CALLBACK_URL,
      headers: { cookie: cookieHeader(login) },
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/")
  })

  it("maps an unreachable token endpoint to sso_unavailable", async () => {
    // fetch signals network failure with a TypeError; sso_unavailable is the
    // code whose error page offers the local sign-in escape hatch, which is
    // exactly what a user needs during a Keycloak outage.
    const login = await startLogin()
    mockOidc.authorizationCodeGrant.mockRejectedValue(
      new TypeError("fetch failed")
    )
    const res = await app.inject({
      url: CALLBACK_URL,
      headers: { cookie: cookieHeader(login) },
    })
    expect(res.headers.location).toBe("/login?error=sso_unavailable")
  })

  it("re-sanitizes a hostile next read back from the session", async () => {
    // The sealed cookie cannot be authored by an attacker, but a session
    // written before the current sanitization rules can hold a value they
    // would now reject; the redirect must not trust it on the way out either.
    const login = await startLogin()
    const session = sessionFromResponse(login)!
    session.set("oidc", {
      ...session.get("oidc")!,
      next: "/\\evil.example.com",
    })
    mockOidc.authorizationCodeGrant.mockResolvedValue(fakeTokens())
    const res = await app.inject({
      url: CALLBACK_URL,
      headers: { cookie: sessionCookie(session) },
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/")
  })

  it("rejects a stored oidc state whose link flag has an unexpected shape", async () => {
    const login = await startLogin()
    const session = sessionFromResponse(login)!
    session.set("oidc", { ...session.get("oidc")!, link: "yes" } as any)
    const res = await app.inject({
      url: CALLBACK_URL,
      headers: { cookie: sessionCookie(session) },
    })
    expect(res.headers.location).toBe("/login?error=state_mismatch")
    expect(mockOidc.authorizationCodeGrant).not.toHaveBeenCalled()
  })

  it("adopts an existing local account by verified email and re-stamps its admin flag", async () => {
    const userId = await createLocalUser({
      username: "localadmin",
      email: "localadmin@example.com",
      isAdmin: true,
    })
    const before = await pool.query(
      `select count(*)::int as n from app_public.users`
    )
    const res = await doCallback({
      email: "localadmin@example.com",
      realm_access: { roles: ["membership"] },
    })
    expect(res.headers.location).toBe("/event/foo")
    const {
      rows: [ua],
    } = await pool.query(
      `select user_id from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-1'`
    )
    expect(ua.user_id).toBe(userId)
    const after = await pool.query(
      `select count(*)::int as n from app_public.users`
    )
    expect(after.rows[0].n).toBe(before.rows[0].n)
    // The registry is the source of truth for admin rights, so an account that
    // was admin locally loses it when the role is absent from the ID token.
    const {
      rows: [user],
    } = await pool.query(
      `select is_admin from app_public.users where id = $1`,
      [userId]
    )
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

  it("redirects with missing_claims when the id token has no email claim", async () => {
    const res = await doCallback({ email: undefined })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/login?error=missing_claims")
  })

  it("refuses logins that land on a break-glass row", async () => {
    const breakGlassId = await createLocalUser({
      username: "ProdekoCTO",
      email: "cto@prodeko.fi",
      isAdmin: true,
    })
    const res = await doCallback({ email: "cto@prodeko.fi" })
    expect(res.headers.location).toBe("/login?error=account_conflict")
    const {
      rows: [user],
    } = await pool.query(
      `select is_admin from app_public.users where id = $1`,
      [breakGlassId]
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
  })

  it("leaves no orphan user when a brand new subject squats a break-glass username", async () => {
    // Nobody holds the break-glass name locally, so link_or_register_user
    // takes the register branch and creates the user before the guard can see
    // the slugified username. Only rolling the transaction back removes it.
    const before = await pool.query(
      `select count(*)::int as n from app_public.users`
    )
    const res = await doCallback({
      sub: "kc-sub-squatter",
      email: "prodekocto@example.com",
    })
    expect(res.headers.location).toBe("/login?error=account_conflict")
    const { rowCount } = await pool.query(
      `select 1 from app_public.users where username = 'prodekocto'`
    )
    expect(rowCount).toBe(0)
    const after = await pool.query(
      `select count(*)::int as n from app_public.users`
    )
    expect(after.rows[0].n).toBe(before.rows[0].n)
    const { rowCount: uaCount } = await pool.query(
      `select 1 from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-squatter'`
    )
    expect(uaCount).toBe(0)
  })

  it("rejects a callback with no oidc state in the session", async () => {
    const res = await app.inject({ url: CALLBACK_URL })
    expect(res.headers.location).toBe("/login?error=state_mismatch")
  })

  it("rejects a callback whose stored oidc state is incomplete", async () => {
    const login = await startLogin()
    const session = sessionFromResponse(login)!
    session.set("oidc", { state: "test-state" } as any)
    const res = await app.inject({
      url: CALLBACK_URL,
      headers: { cookie: sessionCookie(session) },
    })
    expect(res.headers.location).toBe("/login?error=state_mismatch")
    expect(mockOidc.authorizationCodeGrant).not.toHaveBeenCalled()
  })

  it("redirects with code_exchange_failed when the grant fails", async () => {
    const login = await startLogin()
    mockOidc.authorizationCodeGrant.mockRejectedValue(
      new Error("invalid_grant")
    )
    const res = await app.inject({
      url: CALLBACK_URL,
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
      url: CALLBACK_URL,
      headers: { cookie: cookieHeader(failed) },
    })
    expect(replay.headers.location).toBe("/login?error=state_mismatch")
  })
})

describe("account linking", () => {
  it("attaches the identity to the logged-in account when link=1 was used", async () => {
    const userId = await createLocalUser({
      username: "linkowner",
      email: "linkowner@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    const before = await pool.query(
      `select count(*)::int as n from app_public.users`
    )
    const login = await startLogin(
      `link=1&next=${encodeURIComponent("/settings/accounts")}`,
      cookie,
      SAME_ORIGIN
    )
    // A Keycloak address that matches no local account, so only the explicit
    // link intent can put the identity on this user.
    const res = await finishLogin(login, { email: "someone.else@example.com" })
    expect(res.headers.location).toBe("/settings/accounts")
    const {
      rows: [ua],
    } = await pool.query(
      `select user_id from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-1'`
    )
    expect(ua.user_id).toBe(userId)
    const after = await pool.query(
      `select count(*)::int as n from app_public.users`
    )
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })

  it("fails a link whose session died between the two round trips", async () => {
    const userId = await createLocalUser({
      username: "linkraces",
      email: "linkraces@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    const login = await startLogin(
      `link=1&next=${encodeURIComponent("/settings/accounts")}`,
      cookie,
      SAME_ORIGIN
    )
    // The session the link was meant to extend dies while the user is at
    // Keycloak. Proceeding as a plain login would silently sign them in as
    // (or create) a different account than the one they asked to extend.
    await pool.query(`delete from app_private.sessions where user_id = $1`, [
      userId,
    ])
    const res = await finishLogin(login, { email: "someone.else@example.com" })
    expect(res.headers.location).toBe("/login?error=link_session_lost")
    const { rowCount } = await pool.query(
      `select 1 from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-1'`
    )
    expect(rowCount).toBe(0)
  })

  it("never links onto a live session that did not ask for it", async () => {
    const userId = await createLocalUser({
      username: "bystander",
      email: "bystander@example.com",
    })
    // Start the flow logged out, then arrive at the callback carrying a live
    // session as well: without the stored link intent the returning subject
    // must not be bound to that account.
    const login = await startLogin(`next=${encodeURIComponent("/event/foo")}`)
    const oidcData = sessionFromResponse(login)!.get("oidc")!
    const session = sessionFromResponse(await loginAs(userId))!
    session.set("oidc", oidcData)
    mockOidc.authorizationCodeGrant.mockResolvedValue(
      fakeTokens({ email: "someone.else@example.com" })
    )
    const res = await app.inject({
      url: CALLBACK_URL,
      headers: { cookie: sessionCookie(session) },
    })
    // The login itself succeeds; it just must not land on the bystander.
    expect(res.headers.location).toBe("/event/foo")
    const {
      rows: [ua],
    } = await pool.query(
      `select user_id from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-1'`
    )
    expect(ua?.user_id).not.toBe(userId)
  })

  it("refuses to link an identity another account already owns", async () => {
    // User B picks up kc-sub-1 through a plain login.
    await doCallback()
    const {
      rows: [owner],
    } = await pool.query(
      `select user_id from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-1'`
    )
    const userId = await createLocalUser({
      username: "linkthief",
      email: "linkthief@example.com",
    })
    const cookie = cookieHeader(await loginAs(userId))
    const login = await startLogin(
      `link=1&next=${encodeURIComponent("/settings/accounts")}`,
      cookie,
      SAME_ORIGIN
    )
    const res = await finishLogin(login)
    expect(res.headers.location).toBe("/login?error=account_conflict")
    const {
      rows: [ua],
    } = await pool.query(
      `select user_id from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-1'`
    )
    expect(ua.user_id).toBe(owner.user_id)
  })

  it("still refuses a break-glass account on the linking path", async () => {
    const breakGlassId = await createLocalUser({
      username: "ProdekoToimari",
      email: "toimari@prodeko.fi",
      isAdmin: true,
    })
    const cookie = cookieHeader(await loginAs(breakGlassId))
    const login = await startLogin(
      `link=1&next=${encodeURIComponent("/settings/accounts")}`,
      cookie,
      SAME_ORIGIN
    )
    const res = await finishLogin(login, { email: "someone.else@example.com" })
    expect(res.headers.location).toBe("/login?error=account_conflict")
    const { rowCount } = await pool.query(
      `select 1 from app_public.user_authentications
        where service = 'keycloak' and identifier = 'kc-sub-1'`
    )
    expect(rowCount).toBe(0)
    const {
      rows: [user],
    } = await pool.query(
      `select is_admin from app_public.users where id = $1`,
      [breakGlassId]
    )
    expect(user.is_admin).toBe(true)
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

  it("picks the newest identity when the user has more than one", async () => {
    const userId = await createLocalUser({
      username: "twoidentities",
      email: "twoidentities@example.com",
    })
    // An earlier Keycloak identity on this user. Its ID token is stale, so
    // offering it as the logout hint would leave the IdP session standing.
    // (app_private.tg__timestamps owns created_at, hence the real ordering
    // rather than a backdated value.)
    await pool.query(
      `with ua as (
         insert into app_public.user_authentications (user_id, service, identifier)
         values ($1, 'keycloak', 'kc-sub-old')
         returning id
       )
       insert into app_private.user_authentication_secrets (user_authentication_id, details)
       select id, '{"id_token": "stale-id-token"}'::jsonb from ua`,
      [userId]
    )
    // Adoption by verified email hangs a second, newer identity off the same
    // user.
    const res = await doCallback({ email: "twoidentities@example.com" })
    expect(res.headers.location).toBe("/event/foo")
    mockOidc.buildEndSessionUrl.mockReturnValue(
      new URL("http://kc.test/logout")
    )
    await buildKeycloakLogoutUrl(pool, userId)
    expect(mockOidc.buildEndSessionUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id_token_hint: "fake-id-token" })
    )
  })

  it("logs at debug and returns null when the user has no keycloak identity", async () => {
    const userId = await createLocalUser({
      username: "plainlocal",
      email: "plain@example.com",
    })
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
    expect(await buildKeycloakLogoutUrl(pool, userId, logger)).toBeNull()
    expect(logger.debug).toHaveBeenCalledTimes(1)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("logs at error and returns null when discovery fails", async () => {
    await doCallback()
    resetKeycloakConfigForTests()
    mockOidc.discovery.mockRejectedValue(new Error("down"))
    const {
      rows: [ua],
    } = await pool.query(
      `select user_id from app_public.user_authentications where identifier = 'kc-sub-1'`
    )
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
    expect(await buildKeycloakLogoutUrl(pool, ua.user_id, logger)).toBeNull()
    // A dead IdP must be distinguishable in the logs from "no identity".
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.debug).not.toHaveBeenCalled()
  })

  it("logs at error and returns null when the id token lookup fails", async () => {
    const brokenPool = {
      query: jest.fn(async () => {
        throw new Error("connection terminated")
      }),
    } as unknown as Pool
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
    expect(
      await buildKeycloakLogoutUrl(
        brokenPool,
        "00000000-0000-0000-0000-000000000000",
        logger
      )
    ).toBeNull()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.debug).not.toHaveBeenCalled()
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
