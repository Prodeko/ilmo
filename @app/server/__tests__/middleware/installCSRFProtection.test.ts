import { fastify, FastifyInstance, LightMyRequestResponse } from "fastify"

import { ExternalRouteModule } from "../../src/externalRoutes"
import installCSRFProtection from "../../src/middleware/installCSRFProtection"
import installExternalRoutes from "../../src/middleware/installExternalRoutes"
import installSameOrigin from "../../src/middleware/installSameOrigin"
import installSession from "../../src/middleware/installSession"

/*
 * The session, same-origin and CSRF plugins are the real ones, in makeApp's
 * order. POST /graphql and GET /page stand in for PostGraphile and Next.js.
 */
async function buildApp(
  plugins = {
    installCSRFProtection,
    installSameOrigin,
    installSession,
  }
) {
  const app = fastify()
  await app.register(plugins.installSameOrigin)
  await app.register(plugins.installSession)
  await app.register(plugins.installCSRFProtection)
  app.get("/page", async () => "page")
  app.post("/graphql", async () => ({ data: {} }))
  await app.ready()
  return app
}

/** Cookie values exactly as sent, still encoded, as a browser returns them. */
function cookiesOf(res: LightMyRequestResponse): Record<string, string> {
  const header = res.headers["set-cookie"] ?? []
  const lines = Array.isArray(header) ? header : [header]
  return Object.fromEntries(
    lines.map((line) => {
      const pair = line.split(";")[0]
      const eq = pair.indexOf("=")
      return [pair.slice(0, eq), pair.slice(eq + 1)]
    })
  )
}

/** A GET, as a browser loading a page does, then its session and token. */
async function getSessionAndToken(app: FastifyInstance) {
  const res = await app.inject({ method: "GET", url: "/page" })
  const { session, csrfToken } = cookiesOf(res)
  return { session, csrfToken: decodeURIComponent(csrfToken) }
}

function postGraphql(app: FastifyInstance, headers: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: "/graphql",
    headers: { "content-type": "application/json", ...headers },
    payload: { query: "{__typename}" },
  })
}

describe("CSRF protection", () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  it("issues a session and a CSRF token cookie on GET", async () => {
    const { session, csrfToken } = await getSessionAndToken(app)
    expect(session).toBeTruthy()
    expect(csrfToken).toBeTruthy()
  })

  it("rejects a POST without a token", async () => {
    const res = await postGraphql(app, {})
    expect(res.statusCode).toBe(403)
  })

  it("rejects a POST with a session but no token header", async () => {
    const { session, csrfToken } = await getSessionAndToken(app)
    const res = await postGraphql(app, {
      cookie: `session=${session}; csrfToken=${csrfToken}`,
    })
    expect(res.statusCode).toBe(403)
  })

  it("rejects a POST with a wrong token", async () => {
    const { session } = await getSessionAndToken(app)
    const res = await postGraphql(app, {
      cookie: `session=${session}`,
      "csrf-token": "not-the-token",
    })
    expect(res.statusCode).toBe(403)
  })

  it("accepts a POST with the session's token", async () => {
    const { session, csrfToken } = await getSessionAndToken(app)
    const res = await postGraphql(app, {
      cookie: `session=${session}; csrfToken=${csrfToken}`,
      "csrf-token": csrfToken,
    })
    expect(res.statusCode).toBe(200)
  })

  it("does not check GET requests", async () => {
    const res = await app.inject({ method: "GET", url: "/page" })
    expect(res.statusCode).toBe(200)
  })

  it("does not bypass the check for the GraphiQL referer outside development", async () => {
    const res = await postGraphql(app, {
      referer: `${process.env.ROOT_URL}/graphiql`,
    })
    expect(res.statusCode).toBe(403)
  })
})

describe("CSRF protection in development", () => {
  let app: FastifyInstance
  // NODE_ENV is typed read-only
  const env = process.env as Record<string, string | undefined>
  const savedNodeEnv = env.NODE_ENV

  beforeEach(async () => {
    // installCSRFProtection reads NODE_ENV when it is loaded
    env.NODE_ENV = "development"
    let plugins: Parameters<typeof buildApp>[0]
    jest.isolateModules(() => {
      plugins = {
        installCSRFProtection:
          require("../../src/middleware/installCSRFProtection").default,
        installSameOrigin: require("../../src/middleware/installSameOrigin")
          .default,
        installSession: require("../../src/middleware/installSession").default,
      }
    })
    env.NODE_ENV = savedNodeEnv
    app = await buildApp(plugins!)
  })

  afterEach(async () => {
    await app.close()
  })

  it("lets GraphiQL post to /graphql without a token", async () => {
    const res = await postGraphql(app, {
      referer: `${process.env.ROOT_URL}/graphiql`,
    })
    expect(res.statusCode).toBe(200)
  })

  it("still rejects other POSTs without a token", async () => {
    const res = await postGraphql(app, {})
    expect(res.statusCode).toBe(403)
  })
})

describe("CSRF exemptions from the external route registry", () => {
  const ok = async () => ({ ok: true })

  const webhook: ExternalRouteModule = {
    name: "test webhook",
    configured: () => true,
    paths: [
      { method: "POST", path: "/hooks/test", csrfExempt: true },
      { method: "POST", path: "/hooks/test/protected" },
    ],
    register: async (app) => {
      app.post("/hooks/test", ok)
      app.post("/hooks/test/protected", ok)
    },
  }

  const notConfigured: ExternalRouteModule = {
    name: "not configured",
    configured: () => false,
    paths: [{ method: "POST", path: "/hooks/off", csrfExempt: true }],
    register: async (app) => {
      app.post("/hooks/off", ok)
    },
  }

  let app: FastifyInstance

  beforeEach(async () => {
    const externalRoutes = [webhook, notConfigured]
    app = fastify()
    await app.register(installSameOrigin)
    await app.register(installSession)
    await app.register(installCSRFProtection, { externalRoutes })
    await app.register(installExternalRoutes, { externalRoutes })
    app.post("/graphql", ok)
    // Not external routes: a path below an exempt one, and the path of a
    // module that is not configured
    app.post("/hooks/test/other", ok)
    app.post("/hooks/off", ok)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function postWithoutToken(url: string) {
    return app.inject({
      method: "POST",
      url,
      headers: { "content-type": "application/json" },
      payload: {},
    })
  }

  it.each(["/hooks/test", "/hooks/test?x=1"])(
    "lets %s through without a token",
    async (url) => {
      expect((await postWithoutToken(url)).statusCode).toBe(200)
    }
  )

  it.each([
    "/graphql",
    "/hooks/test/protected",
    "/hooks/test/other",
    "/hooks/off",
  ])("still rejects %s without a token", async (url) => {
    expect((await postWithoutToken(url)).statusCode).toBe(403)
  })
})
