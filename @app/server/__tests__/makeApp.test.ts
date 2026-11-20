import { FastifyInstance } from "fastify"

import { makeApp } from "../src/app"

/*
 * makeApp with everything heavy (database pools, Redis, PostGraphile,
 * Next.js) stubbed; the health, same-origin, session, CSRF and external
 * route plugins are the real ones, in makeApp's order. The external route
 * registry holds one test module.
 */

jest.mock("../src/externalRoutes", () => {
  const actual = jest.requireActual("../src/externalRoutes")
  const ok = async () => ({ ok: true })
  return {
    ...actual,
    externalRoutes: [
      {
        name: "test webhook",
        configured: () => true,
        paths: [
          { method: "POST", path: "/hooks/test", csrfExempt: true },
          { method: "POST", path: "/hooks/test/protected" },
        ],
        register: async (app: FastifyInstance) => {
          app.post("/hooks/test", ok)
          app.post("/hooks/test/protected", ok)
        },
      },
    ],
  }
})

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

it("serves a registered external route without a CSRF token when it is exempt", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/hooks/test",
    headers: { "content-type": "application/json" },
    payload: {},
  })
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ ok: true })
})

it("rejects an external route that is not exempt without a CSRF token", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/hooks/test/protected",
    headers: { "content-type": "application/json" },
    payload: {},
  })
  expect(res.statusCode).toBe(403)
})
