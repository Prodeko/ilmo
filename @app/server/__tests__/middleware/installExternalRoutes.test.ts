import { fastify, FastifyInstance } from "fastify"
import fp from "fastify-plugin"

import { csrfExemptions, ExternalRouteModule } from "../../src/externalRoutes"
import installExternalRoutes from "../../src/middleware/installExternalRoutes"

import type { FeatureKey } from "@app/lib"

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

describe("the feature flag gate", () => {
  // The registry may not have a key a test can use, so the tests pass their own.
  const testFlag = "external_routes_test" as FeatureKey

  function gated(
    overrides: Partial<ExternalRouteModule> = {},
    calls: string[] = []
  ) {
    return module({
      name: "gated",
      feature: testFlag,
      paths: [
        { method: "POST", path: "/gated" },
        { method: "GET", path: "/gated" },
      ],
      register: async (scope) => {
        scope.addHook("onRequest", async (request) => {
          calls.push(`hook ${request.method}`)
        })
        scope.post("/gated", async () => {
          calls.push("POST")
          return { ok: true }
        })
        scope.get("/gated", async () => {
          calls.push("GET")
          return { ok: true }
        })
      },
      ...overrides,
    })
  }

  it.each([
    ["a plain plugin", (register: ExternalRouteModule["register"]) => register],
    [
      "a fastify-plugin",
      (register: ExternalRouteModule["register"]) => fp(register),
    ],
  ])(
    "answers 404 before any of the module's code runs while the flag is off, with %s",
    async (_, wrap) => {
      const calls: string[] = []
      const base = gated({}, calls)
      const isFeatureEnabled = jest.fn(async () => false)
      await app.register(installExternalRoutes, {
        externalRoutes: [{ ...base, register: wrap(base.register) }],
        isFeatureEnabled,
      })

      for (const method of ["POST", "GET", "HEAD"] as const) {
        const res = await app.inject({ method, url: "/gated" })
        expect(res.statusCode).toBe(404)
      }
      expect(calls).toEqual([])
      expect(isFeatureEnabled).toHaveBeenCalledWith(testFlag)
    }
  )

  it("reads the flag on every request", async () => {
    const calls: string[] = []
    let enabled = true
    await app.register(installExternalRoutes, {
      externalRoutes: [gated({}, calls)],
      isFeatureEnabled: async () => enabled,
    })

    expect(
      (await app.inject({ method: "POST", url: "/gated" })).json()
    ).toEqual({ ok: true })
    enabled = false
    expect(
      (await app.inject({ method: "POST", url: "/gated" })).statusCode
    ).toBe(404)
    enabled = true
    expect(
      (await app.inject({ method: "GET", url: "/gated" })).statusCode
    ).toBe(200)
    expect(calls).toEqual(["hook POST", "POST", "hook GET", "GET"])
  })

  it("keeps the routes answering while the flag is off when gateWhenOff is false", async () => {
    const isFeatureEnabled = jest.fn(async () => false)
    await app.register(installExternalRoutes, {
      externalRoutes: [gated({ gateWhenOff: false })],
      isFeatureEnabled,
    })

    expect(
      (await app.inject({ method: "POST", url: "/gated" })).statusCode
    ).toBe(200)
    expect(isFeatureEnabled).not.toHaveBeenCalled()
  })

  it("does not read any flag for a module without a feature, nor for other modules", async () => {
    const isFeatureEnabled = jest.fn(async () => false)
    const open = module({
      name: "open",
      paths: [{ method: "POST", path: "/open" }],
      register: async (scope) => {
        scope.post("/open", ok)
      },
    })
    await app.register(installExternalRoutes, {
      externalRoutes: [gated(), open],
      isFeatureEnabled,
    })

    expect(
      (await app.inject({ method: "POST", url: "/open" })).statusCode
    ).toBe(200)
    expect(isFeatureEnabled).not.toHaveBeenCalled()
  })
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

  describe("for the registry as it stands", () => {
    const savedIssuer = process.env.KEYCLOAK_ISSUER
    afterEach(() => {
      process.env.KEYCLOAK_ISSUER = savedIssuer
    })

    it("exempts POST /mcp when Keycloak is configured", () => {
      process.env.KEYCLOAK_ISSUER = "https://id.example.org/realms/test"
      expect(csrfExemptions()).toEqual([{ method: "POST", path: "/mcp" }])
    })

    it("is empty when Keycloak is not configured", () => {
      process.env.KEYCLOAK_ISSUER = ""
      expect(csrfExemptions()).toEqual([])
    })
  })
})
