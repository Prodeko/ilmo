import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

const KEYCLOAK_ENV_KEYS = [
  "KEYCLOAK_ISSUER",
  "KEYCLOAK_CLIENT_ID",
  "KEYCLOAK_CLIENT_SECRET",
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of KEYCLOAK_ENV_KEYS) {
    savedEnv[key] = process.env[key]
  }
})

afterEach(() => {
  for (const key of KEYCLOAK_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
})

// The login page hides the password form and the settings page shows the link
// affordance based on this answer, so it has to track the server's actual
// configuration: stuck true hides break-glass sign-in during an outage, stuck
// false leaves a password form on a page that should hand off to Keycloak.
test("ssoLoginEnabled tracks the KEYCLOAK_* environment", async () => {
  process.env.KEYCLOAK_ISSUER =
    "http://localhost:8180/realms/membership-registry"
  process.env.KEYCLOAK_CLIENT_ID = "ilmokilke"
  process.env.KEYCLOAK_CLIENT_SECRET = "test-secret"
  // No snapshot: the result deliberately flips with the environment between
  // the two calls.
  await runGraphQLQuery(
    `{ ssoLoginEnabled }`,
    {},
    {},
    async (json) => {
      expect(json.errors).toBeFalsy()
      expect(json.data!.ssoLoginEnabled).toBe(true)
    },
    true,
    false
  )

  delete process.env.KEYCLOAK_CLIENT_SECRET
  await runGraphQLQuery(
    `{ ssoLoginEnabled }`,
    {},
    {},
    async (json) => {
      expect(json.errors).toBeFalsy()
      expect(json.data!.ssoLoginEnabled).toBe(false)
    },
    true,
    false
  )
})
