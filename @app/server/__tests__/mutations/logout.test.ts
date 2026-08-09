import { LogoutDocument } from "@app/graphql"
import * as oidc from "openid-client"
import { Pool } from "pg"

import { resetKeycloakConfigForTests } from "../../src/middleware/installKeycloak"
import {
  createUserAndLogIn,
  deleteTestData,
  runGraphQLQuery,
  setup,
  teardown,
  TEST_DATABASE_URL,
} from "../helpers"

// openid-client talks to a real Keycloak; the logout chain only needs it to
// hand back an end-session URL.
jest.mock("openid-client", () => ({
  discovery: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  randomState: jest.fn(),
  randomNonce: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  allowInsecureRequests: Symbol("allowInsecureRequests"),
}))

const mockOidc = oidc as jest.Mocked<typeof oidc>
const END_SESSION_URL = "http://kc.test/logout?id_token_hint=fake-id-token"

let pool: Pool

beforeAll(async () => {
  process.env.KEYCLOAK_ISSUER =
    "http://localhost:8180/realms/membership-registry"
  process.env.KEYCLOAK_CLIENT_ID = "ilmokilke"
  process.env.KEYCLOAK_CLIENT_SECRET = "test-secret"
  pool = new Pool({ connectionString: TEST_DATABASE_URL })
  await setup()
})

afterAll(async () => {
  await pool.end()
  await teardown()
})

beforeEach(async () => {
  await deleteTestData()
  jest.clearAllMocks()
  resetKeycloakConfigForTests()
  mockOidc.discovery.mockResolvedValue({} as any)
  mockOidc.buildEndSessionUrl.mockReturnValue(new URL(END_SESSION_URL))
})

/**
 * A logged-in user whose account carries a Keycloak identity with a stored ID
 * token, committed outside the test transaction because the logout resolver
 * reads it through `rootPgPool`.
 */
async function createSsoUser() {
  const { user, session } = await createUserAndLogIn()
  const {
    rows: [auth],
  } = await pool.query(
    `insert into app_public.user_authentications (user_id, service, identifier, details)
     values ($1, 'keycloak', $2, '{}'::json) returning id`,
    [user.id, `kc-sub-${user.id}`]
  )
  await pool.query(
    `insert into app_private.user_authentication_secrets (user_authentication_id, details)
     values ($1, $2::json)`,
    [auth.id, JSON.stringify({ id_token: "fake-id-token" })]
  )
  return { user, session }
}

/**
 * `runGraphQLQuery` replaces its whole `_fastifyRequest` stub with whatever we
 * pass, so the fields the logout resolver needs have to be repeated here:
 * `logOut` for Passport and `session.get("sso")` for `isSsoSession`.
 */
function requestOptions(sessionId: string, sso: boolean) {
  return {
    user: { sessionId },
    _fastifyRequest: {
      ip: "127.1.1.1",
      url: "/graphql",
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      logIn: () => null,
      logOut: () => null,
      session: { get: (key: string) => (key === "sso" ? sso : undefined) },
    },
  }
}

describe("Logout", () => {
  it("returns a Keycloak end-session url for an sso session", async () => {
    const { session } = await createSsoUser()

    await runGraphQLQuery(
      LogoutDocument,
      {},
      requestOptions(session.uuid, true),
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data!.logout.success).toBe(true)
        expect(json.data!.logout.redirectTo).toBe(END_SESSION_URL)
        expect(mockOidc.buildEndSessionUrl).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            id_token_hint: "fake-id-token",
            post_logout_redirect_uri: `${process.env.ROOT_URL}/`,
          })
        )
      }
    )
  })

  it("returns no redirect for a password session on the same account", async () => {
    const { session } = await createSsoUser()

    await runGraphQLQuery(
      LogoutDocument,
      {},
      requestOptions(session.uuid, false),
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data!.logout.success).toBe(true)
        expect(json.data!.logout.redirectTo).toBeNull()
        expect(mockOidc.buildEndSessionUrl).not.toHaveBeenCalled()
      }
    )
  })

  it("returns no redirect for an sso session on an account with no keycloak identity", async () => {
    const { session } = await createUserAndLogIn()

    await runGraphQLQuery(
      LogoutDocument,
      {},
      requestOptions(session.uuid, true),
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data!.logout.success).toBe(true)
        expect(json.data!.logout.redirectTo).toBeNull()
        expect(mockOidc.buildEndSessionUrl).not.toHaveBeenCalled()
      }
    )
  })
})
