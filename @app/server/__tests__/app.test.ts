import { FastifyInstance } from "fastify"
import { Pool } from "pg"

import { makeApp } from "../src/app"
import { STRIPE_WEBHOOK_PATH } from "../src/middleware/installStripeWebhook"

import {
  disablePayments,
  enablePaymentsForEachTest,
  STRIPE_WEBHOOK_SECRET,
} from "./payments"

/*
 * makeApp registers the Stripe webhook only while payments are enabled.
 * Everything heavy (database pools, Redis, PostGraphile, Next.js) is
 * stubbed; the session, CSRF protection and webhook plugins are the real
 * ones, in makeApp's order.
 */

jest.mock("stripe", () => require("./stripeMock").mockStripeModule())

let testPool: Pool

jest.mock("../src/middleware", () => {
  const actual = jest.requireActual("../src/middleware")
  const fastifyPlugin = jest.requireActual("fastify-plugin")
  const noop = fastifyPlugin(async () => {})
  return {
    ...actual,
    installDatabasePools: fastifyPlugin(async (app: FastifyInstance) => {
      app.decorate("rootPgPool", testPool)
    }),
    installRedis: noop,
    installWorkerUtils: noop,
    installHelmet: noop,
    installSameOrigin: noop,
    installPassport: noop,
    installKeycloak: noop,
    installStaticUploads: noop,
    // Stands in for /graphql: an ordinary route after the webhook
    installPostGraphile: fastifyPlugin(async (app: FastifyInstance) => {
      app.post("/graphql", async (request) => ({ body: request.body }))
    }),
    installFileUpload: noop,
    installSSR: noop,
  }
})

jest.mock("../src/middleware/installCypressServerCommand", () => ({
  __esModule: true,
  default: jest.requireActual("fastify-plugin")(async () => {}),
}))

const ActualStripe = jest.requireActual("stripe")
const { webhooks } = new ActualStripe("sk_test_123")

enablePaymentsForEachTest()

let app: FastifyInstance | null = null

beforeAll(() => {
  testPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
})

afterAll(async () => {
  await testPool.end()
})

afterEach(async () => {
  await app?.close()
  app = null
})

function signedEvent() {
  const payload = JSON.stringify({
    id: `evt_test_app_${Date.now()}`,
    object: "event",
    type: "customer.created",
    data: { object: { id: "cus_1", object: "customer" } },
  })
  return {
    payload,
    signature: webhooks.generateTestHeaderString({
      payload,
      secret: STRIPE_WEBHOOK_SECRET,
    }),
  }
}

async function postWebhook(instance: FastifyInstance) {
  const { payload, signature } = signedEvent()
  return instance.inject({
    method: "POST",
    url: STRIPE_WEBHOOK_PATH,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    payload,
  })
}

it("registers the webhook while payments are enabled", async () => {
  app = await makeApp()
  await app.ready()

  const res = await postWebhook(app)
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ received: true })

  // A bad signature is refused by the webhook itself
  const bad = await app.inject({
    method: "POST",
    url: STRIPE_WEBHOOK_PATH,
    headers: { "content-type": "application/json", "stripe-signature": "x" },
    payload: "{}",
  })
  expect(bad.statusCode).toBe(400)
})

it("keeps CSRF protection for other routes", async () => {
  app = await makeApp()
  await app.ready()

  const res = await app.inject({
    method: "POST",
    url: "/graphql",
    headers: { "content-type": "application/json" },
    payload: { hello: "world" },
  })
  // Only the webhook is exempt from the CSRF token
  expect(res.statusCode).toBe(403)
})

it("has no webhook route while payments are disabled", async () => {
  disablePayments()
  app = await makeApp()
  await app.ready()

  expect(app.hasRoute({ method: "POST", url: STRIPE_WEBHOOK_PATH })).toBe(false)
  const res = await postWebhook(app)
  expect(res.statusCode).not.toBe(200)
})
