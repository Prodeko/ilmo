import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

const PAYMENTS_ENV_KEYS = [
  "PAYMENTS_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of PAYMENTS_ENV_KEYS) {
    savedEnv[key] = process.env[key]
  }
})

afterEach(() => {
  for (const key of PAYMENTS_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
})

async function expectPaymentsEnabled(expected: boolean) {
  // No snapshot: the result deliberately flips with the environment.
  await runGraphQLQuery(
    `{ paymentsEnabled }`,
    {},
    {},
    async (json) => {
      expect(json.errors).toBeFalsy()
      expect(json.data!.paymentsEnabled).toBe(expected)
    },
    true,
    false
  )
}

// Every page reads this through SharedLayout to decide whether to show any
// payment UI at all, so it has to follow the server's actual configuration.
test("paymentsEnabled tracks the PAYMENTS_ENABLED / STRIPE_* environment", async () => {
  process.env.PAYMENTS_ENABLED = "1"
  process.env.STRIPE_SECRET_KEY = "sk_test_123"
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123"
  await expectPaymentsEnabled(true)

  delete process.env.STRIPE_WEBHOOK_SECRET
  await expectPaymentsEnabled(false)

  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123"
  process.env.PAYMENTS_ENABLED = "0"
  await expectPaymentsEnabled(false)
})
