import { fastify, FastifyInstance } from "fastify"
import fp from "fastify-plugin"

import {
  csrfExemptions,
  ExternalRouteModule,
  externalRoutes,
} from "../../src/externalRoutes"
import installExternalRoutes from "../../src/middleware/installExternalRoutes"

const ok = async () => ({ ok: true })

function module(
  overrides: Partial<ExternalRouteModule> & Pick<ExternalRouteModule, "name">
): ExternalRouteModule {
  return {
    configured: () => true,
    paths: [],
    register: async () => {},
    ...overrides,
  }
}

let app: FastifyInstance

beforeEach(() => {
  app = fastify()
})

afterEach(async () => {
  await app.close()
})

it("registers the routes of configured modules only", async () => {
  const on = module({
    name: "on",
    paths: [
      { method: "POST", path: "/on" },
      { method: "GET", path: "/on/status" },
    ],
    register: async (scope) => {
      scope.post("/on", ok)
      scope.get("/on/status", ok)
    },
  })
  const off = module({
    name: "off",
    configured: () => false,
    paths: [{ method: "POST", path: "/off" }],
    register: async (scope) => {
      scope.post("/off", ok)
    },
  })
  await app.register(installExternalRoutes, { externalRoutes: [on, off] })
  await app.ready()

  expect(app.hasRoute({ method: "POST", url: "/on" })).toBe(true)
  expect(app.hasRoute({ method: "GET", url: "/on/status" })).toBe(true)
  expect(app.hasRoute({ method: "POST", url: "/off" })).toBe(false)
  expect(
    (await app.inject({ method: "HEAD", url: "/on/status" })).statusCode
  ).toBe(200)
})

it.each([
  ["a plain plugin", (register: ExternalRouteModule["register"]) => register],
  [
    "a fastify-plugin",
    (register: ExternalRouteModule["register"]) => fp(register),
  ],
])(
  "refuses a route the module did not declare, registered by %s",
  async (_, wrap) => {
    const sneaky = module({
      name: "sneaky",
      paths: [{ method: "POST", path: "/declared" }],
      register: wrap(async (scope) => {
        scope.post("/declared", ok)
        scope.post("/undeclared", ok)
      }),
    })
    await expect(
      app.register(installExternalRoutes, { externalRoutes: [sneaky] })
    ).rejects.toThrow(
      "External route module 'sneaky' registered POST /undeclared, which is not in its paths"
    )
  }
)

it("refuses a declared path under another method", async () => {
  const wrongMethod = module({
    name: "wrong method",
    paths: [{ method: "POST", path: "/hook" }],
    register: async (scope) => {
      scope.put("/hook", ok)
    },
  })
  await expect(
    app.register(installExternalRoutes, { externalRoutes: [wrongMethod] })
  ).rejects.toThrow("registered PUT /hook")
})

describe("csrfExemptions", () => {
  it("lists the exempt paths of configured modules", () => {
    expect(
      csrfExemptions([
        module({
          name: "on",
          paths: [
            { method: "POST", path: "/a", csrfExempt: true },
            { method: "POST", path: "/b" },
            { method: "GET", path: "/a" },
          ],
        }),
        module({
          name: "off",
          configured: () => false,
          paths: [{ method: "POST", path: "/c", csrfExempt: true }],
        }),
      ])
    ).toEqual([{ method: "POST", path: "/a" }])
  })

  it("lists the Telegram webhook only when it is configured", () => {
    expect(externalRoutes.map((m) => m.name)).toEqual(["telegram"])
    const saved = { ...process.env }
    try {
      delete process.env.TELEGRAM_BOT_TOKEN
      expect(csrfExemptions()).toEqual([])
      Object.assign(process.env, {
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_UPDATE_MODE: "webhook",
        TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
      })
      expect(csrfExemptions()).toEqual([
        { method: "POST", path: "/telegram/webhook" },
      ])
    } finally {
      process.env = saved
    }
  })
})

describe("feature flag gate", () => {
  const gated = (overrides: Partial<ExternalRouteModule> = {}) =>
    module({
      name: "gated",
      feature: "telegram_reminders",
      paths: [{ method: "POST", path: "/gated" }],
      register: async (scope) => {
        scope.post("/gated", ok)
      },
      ...overrides,
    })

  it("answers 404 while the flag is off, checked per request", async () => {
    let enabled = false
    const isFeatureEnabled = jest.fn(async () => enabled)
    await app.register(installExternalRoutes, {
      externalRoutes: [gated()],
      isFeatureEnabled,
    })
    const off = await app.inject({ method: "POST", url: "/gated" })
    expect(off.statusCode).toBe(404)
    enabled = true
    const on = await app.inject({ method: "POST", url: "/gated" })
    expect(on.statusCode).toBe(200)
    expect(isFeatureEnabled).toHaveBeenCalledWith("telegram_reminders")
  })

  it("does not gate a module with gateWhenOff false", async () => {
    const isFeatureEnabled = jest.fn(async () => false)
    await app.register(installExternalRoutes, {
      externalRoutes: [gated({ gateWhenOff: false })],
      isFeatureEnabled,
    })
    const response = await app.inject({ method: "POST", url: "/gated" })
    expect(response.statusCode).toBe(200)
    expect(isFeatureEnabled).not.toHaveBeenCalled()
  })

  it("does not gate other routes", async () => {
    const isFeatureEnabled = jest.fn(async () => false)
    app.post("/outside", ok)
    await app.register(installExternalRoutes, {
      externalRoutes: [gated()],
      isFeatureEnabled,
    })
    const response = await app.inject({ method: "POST", url: "/outside" })
    expect(response.statusCode).toBe(200)
    expect(isFeatureEnabled).not.toHaveBeenCalled()
  })
})
