import { FeatureKey } from "@app/lib"
import { Pool } from "pg"

import {
  createFeatureFlagReader,
  FEATURE_FLAG_CACHE_TTL_MS,
  syncFeatureAvailability,
} from "../../src/utils/featureFlags"

// The registry has no keys yet; these tests use their own rows.
const key = (name: string) => name as FeatureKey

type Row = { key: string; enabled: boolean; admins_only: boolean }

function fakePool(rows: Row[]) {
  const pool = {
    rows,
    query: jest.fn(async () => ({ rows: pool.rows })),
  }
  return pool
}

describe("createFeatureFlagReader", () => {
  it("reads enabled flags and treats unknown keys as off", async () => {
    const pool = fakePool([
      { key: "a", enabled: true, admins_only: false },
      { key: "b", enabled: false, admins_only: false },
    ])
    const reader = createFeatureFlagReader(pool as any)
    expect(await reader.isFeatureEnabled(key("a"))).toBe(true)
    expect(await reader.isFeatureEnabled(key("b"))).toBe(false)
    expect(await reader.isFeatureEnabled(key("missing"))).toBe(false)
  })

  it("counts admins_only as on only for callers that pass asAdmin", async () => {
    const pool = fakePool([{ key: "a", enabled: false, admins_only: true }])
    const reader = createFeatureFlagReader(pool as any)
    expect(await reader.isFeatureEnabled(key("a"))).toBe(false)
    expect(await reader.isFeatureEnabled(key("a"), { asAdmin: false })).toBe(
      false
    )
    expect(await reader.isFeatureEnabled(key("a"), { asAdmin: true })).toBe(
      true
    )
  })

  it("serves reads from the cache until the TTL has passed", async () => {
    let time = 1000
    const pool = fakePool([{ key: "a", enabled: false, admins_only: false }])
    const reader = createFeatureFlagReader(pool as any, { now: () => time })

    expect(await reader.isFeatureEnabled(key("a"))).toBe(false)
    pool.rows = [{ key: "a", enabled: true, admins_only: false }]

    time += FEATURE_FLAG_CACHE_TTL_MS - 1
    expect(await reader.isFeatureEnabled(key("a"))).toBe(false)
    expect(pool.query).toHaveBeenCalledTimes(1)

    time += 1
    expect(await reader.isFeatureEnabled(key("a"))).toBe(true)
    expect(pool.query).toHaveBeenCalledTimes(2)
  })

  it("reads the database again after invalidate()", async () => {
    const pool = fakePool([{ key: "a", enabled: false, admins_only: false }])
    const reader = createFeatureFlagReader(pool as any)
    expect(await reader.isFeatureEnabled(key("a"))).toBe(false)
    pool.rows = [{ key: "a", enabled: true, admins_only: false }]
    reader.invalidate()
    expect(await reader.isFeatureEnabled(key("a"))).toBe(true)
    expect(pool.query).toHaveBeenCalledTimes(2)
  })

  it("shares one query between concurrent reads", async () => {
    const pool = fakePool([{ key: "a", enabled: true, admins_only: false }])
    const reader = createFeatureFlagReader(pool as any)
    const results = await Promise.all([
      reader.isFeatureEnabled(key("a")),
      reader.isFeatureEnabled(key("a")),
      reader.isFeatureEnabled(key("b")),
    ])
    expect(results).toEqual([true, true, false])
    expect(pool.query).toHaveBeenCalledTimes(1)
  })

  it("does not cache a load that started before invalidate()", async () => {
    let release: (value: { rows: Row[] }) => void = () => {}
    const pool = {
      query: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = resolve
            })
        )
        .mockResolvedValue({
          rows: [{ key: "a", enabled: true, admins_only: false }],
        }),
    }
    const reader = createFeatureFlagReader(pool as any)
    const stale = reader.isFeatureEnabled(key("a"))
    reader.invalidate()
    release({ rows: [{ key: "a", enabled: false, admins_only: false }] })
    expect(await stale).toBe(false)
    expect(await reader.isFeatureEnabled(key("a"))).toBe(true)
    expect(pool.query).toHaveBeenCalledTimes(2)
  })

  it("lets a failed read fail the caller and retries on the next read", async () => {
    const pool = {
      query: jest
        .fn()
        .mockRejectedValueOnce(new Error("connection refused"))
        .mockResolvedValue({
          rows: [{ key: "a", enabled: true, admins_only: false }],
        }),
    }
    const reader = createFeatureFlagReader(pool as any)
    await expect(reader.isFeatureEnabled(key("a"))).rejects.toThrow(
      "connection refused"
    )
    expect(await reader.isFeatureEnabled(key("a"))).toBe(true)
  })
})

describe("against the database", () => {
  let pool: Pool
  const KEYS = ["server_test_on", "server_test_preview", "server_test_off"]

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  })

  afterEach(async () => {
    await pool.query(
      "delete from app_public.feature_flags where key like 'server_test_%'"
    )
  })

  afterAll(() => pool.end())

  const insertFlag = (
    flagKey: string,
    state: string,
    { available = true, retired = false } = {}
  ) =>
    pool.query(
      `insert into app_public.feature_flags (key, state, available, description, retired_at)
       values ($1, $2, $3, 'Test flag', case when $4::boolean then now() end)`,
      [flagKey, state, available, retired]
    )

  it("follows app_public.feature_enabled for a caller without a session", async () => {
    await insertFlag(KEYS[0], "on")
    await insertFlag(KEYS[1], "admins_only")
    await insertFlag(KEYS[2], "off")
    await insertFlag("server_test_unavailable", "on", { available: false })
    await insertFlag("server_test_retired", "off", { retired: true })
    const reader = createFeatureFlagReader(pool)

    const read = (name: string, asAdmin = false) =>
      reader.isFeatureEnabled(key(name), { asAdmin })

    expect(await read("server_test_on")).toBe(true)
    expect(await read("server_test_preview")).toBe(false)
    expect(await read("server_test_preview", true)).toBe(true)
    expect(await read("server_test_off", true)).toBe(false)
    expect(await read("server_test_unavailable", true)).toBe(false)
    expect(await read("server_test_retired")).toBe(true)
    expect(await read("server_test_missing", true)).toBe(false)
  })

  describe("syncFeatureAvailability", () => {
    const features = {
      server_test_integration: {
        description: "Needs two secrets",
        requiresEnv: ["SERVER_TEST_SECRET_A", "SERVER_TEST_SECRET_B"],
      },
      server_test_plain: { description: "Needs nothing" },
    }

    const availability = async () => {
      const { rows } = await pool.query(
        "select key, available from app_public.feature_flags where key like 'server_test_%' order by key"
      )
      return Object.fromEntries(rows.map((row) => [row.key, row.available]))
    }

    beforeEach(async () => {
      await insertFlag("server_test_integration", "on")
      await insertFlag("server_test_plain", "on", { available: false })
    })

    it("marks an integration unavailable when a variable is missing or empty", async () => {
      const result = await syncFeatureAvailability(pool, {
        features,
        env: { SERVER_TEST_SECRET_A: "x", SERVER_TEST_SECRET_B: "" },
      })
      expect(result).toEqual({
        available: { server_test_integration: false },
        missing: [],
      })
      // Flags without requirements are left as they are.
      expect(await availability()).toEqual({
        server_test_integration: false,
        server_test_plain: false,
      })
      const reader = createFeatureFlagReader(pool)
      expect(
        await reader.isFeatureEnabled(key("server_test_integration"))
      ).toBe(false)
    })

    it("marks an integration available again once every variable is set", async () => {
      await pool.query(
        "update app_public.feature_flags set available = false where key = 'server_test_integration'"
      )
      const result = await syncFeatureAvailability(pool, {
        features,
        env: { SERVER_TEST_SECRET_A: "x", SERVER_TEST_SECRET_B: "y" },
      })
      expect(result.available).toEqual({ server_test_integration: true })
      expect((await availability()).server_test_integration).toBe(true)
    })

    it("reports registry keys that have no row", async () => {
      const result = await syncFeatureAvailability(pool, {
        features: {
          server_test_unmigrated: {
            description: "No row",
            requiresEnv: ["SERVER_TEST_SECRET_A"],
          },
        },
        env: {},
      })
      expect(result).toEqual({
        available: {},
        missing: ["server_test_unmigrated"],
      })
    })
  })
})
