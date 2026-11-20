import { FeatureKey } from "@app/lib"
import { fastify, FastifyInstance } from "fastify"
import { Pool } from "pg"

import installFeatureFlags from "../../src/middleware/installFeatureFlags"
import {
  invalidateFeatureFlags,
  isFeatureEnabled,
} from "../../src/utils/featureFlags"

// Boot reads the real registry, which has no integration-backed keys yet, so
// it is replaced by one fake entry here.
jest.mock("@app/lib", () => ({
  ...jest.requireActual("@app/lib"),
  FEATURES: {
    server_boot_test: {
      description: "Test flag",
      requiresEnv: ["SERVER_BOOT_TEST_SECRET"],
    },
  },
}))

const KEY = "server_boot_test" as FeatureKey

let pool: Pool
let app: FastifyInstance | null = null

const boot = async (logger = { warn: jest.fn(), error: jest.fn() }) => {
  app = fastify()
  app.decorate("rootPgPool", pool)
  const log = app.log
  Object.assign(log, logger)
  await app.register(installFeatureFlags)
  await app.ready()
  return logger
}

beforeAll(() => {
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
})

afterEach(async () => {
  delete process.env.SERVER_BOOT_TEST_SECRET
  await app?.close()
  app = null
  await pool.query(
    "delete from app_public.feature_flags where key = 'server_boot_test'"
  )
  invalidateFeatureFlags()
})

afterAll(() => pool.end())

const insertFlag = () =>
  pool.query(
    `insert into app_public.feature_flags (key, state, description)
     values ('server_boot_test', 'on', 'Test flag')`
  )

describe("installFeatureFlags", () => {
  it("marks a feature unavailable at boot when its configuration is missing", async () => {
    await insertFlag()
    const logger = await boot()
    const {
      rows: [row],
    } = await pool.query(
      "select available from app_public.feature_flags where key = 'server_boot_test'"
    )
    expect(row.available).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      { feature: "server_boot_test" },
      expect.stringContaining("not configured")
    )
    // ...and points isFeatureEnabled at the root pool.
    expect(await isFeatureEnabled(KEY)).toBe(false)
  })

  it("marks a configured feature available and enabled", async () => {
    await insertFlag()
    await pool.query(
      "update app_public.feature_flags set available = false where key = 'server_boot_test'"
    )
    process.env.SERVER_BOOT_TEST_SECRET = "secret"
    const logger = await boot()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(await isFeatureEnabled(KEY)).toBe(true)
  })

  it("logs registry keys without a row and still boots", async () => {
    const logger = await boot()
    expect(logger.error).toHaveBeenCalledWith(
      { features: ["server_boot_test"] },
      expect.stringContaining("no row")
    )
    expect(await isFeatureEnabled(KEY)).toBe(false)
  })
})
