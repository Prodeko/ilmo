import { FastifyInstance } from "fastify"

import { makeApp } from "../src/app"

/*
 * makeApp with everything heavy (database pools, Redis, PostGraphile,
 * Next.js) stubbed; the health, same-origin, session and CSRF plugins are
 * the real ones, in makeApp's order.
 */

jest.mock("../src/middleware", () => {
  const actual = jest.requireActual("../src/middleware")
  const fastifyPlugin = jest.requireActual("fastify-plugin")
  const noop = fastifyPlugin(async () => {})
  return {
    ...actual,
    installDatabasePools: noop,
    installRedis: noop,
    installWorkerUtils: noop,
    installHelmet: noop,
    installPassport: noop,
    installKeycloak: noop,
    installStaticUploads: noop,
    // Stands in for PostGraphile's /graphql
    installPostGraphile: fastifyPlugin(async (app: FastifyInstance) => {
      app.post("/graphql", async () => ({ data: {} }))
    }),
    installFileUpload: noop,
    installSSR: noop,
  }
})

jest.mock("../src/middleware/installCypressServerCommand", () => ({
  __esModule: true,
  default: jest.requireActual("fastify-plugin")(async () => {}),
}))

let app: FastifyInstance

beforeAll(async () => {
  process.env.LOG_LEVEL = "silent"
  app = await makeApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
  delete process.env.LOG_LEVEL
})

it("serves the health check", async () => {
  const res = await app.inject({ method: "GET", url: "/healthz" })
  expect(res.statusCode).toBe(200)
  expect(res.body).toBe("ok")
})

it("rejects a POST to /graphql without a CSRF token", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/graphql",
    headers: { "content-type": "application/json" },
    payload: { query: "{__typename}" },
  })
  expect(res.statusCode).toBe(403)
})
