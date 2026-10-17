import { Pool } from "pg"

import { TEST_DATABASE_URL } from "../../../__tests__/helpers"
import { poolConfig } from "../../src/utils/poolConfig"

const ENV_VARS = [
  "DATABASE_POOL_MAX_ROOT",
  "DATABASE_POOL_MAX_AUTH",
  "DATABASE_POOL_ACQUIRE_TIMEOUT_MS",
]

describe("poolConfig", () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const name of ENV_VARS) {
      saved[name] = process.env[name]
      delete process.env[name]
    }
  })

  afterEach(() => {
    for (const name of ENV_VARS) {
      if (saved[name] === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = saved[name]
      }
    }
  })

  it("defaults the auth pool to 5 connections and a 5 s acquire timeout", () => {
    expect(poolConfig("auth")).toEqual({
      max: 5,
      connectionTimeoutMillis: 5000,
    })
  })

  it("defaults the root pool to 2 connections", () => {
    expect(poolConfig("root").max).toEqual(2)
  })

  it("reads the pool size from the environment", () => {
    process.env.DATABASE_POOL_MAX_AUTH = "7"
    expect(poolConfig("auth").max).toEqual(7)
  })

  it("reads the acquire timeout from the environment", () => {
    process.env.DATABASE_POOL_ACQUIRE_TIMEOUT_MS = "250"
    expect(poolConfig("root").connectionTimeoutMillis).toEqual(250)
  })

  it("rejects a non-numeric value, naming the variable", () => {
    process.env.DATABASE_POOL_MAX_ROOT = "lots"
    expect(() => poolConfig("root")).toThrow(/DATABASE_POOL_MAX_ROOT/)
  })

  it("fails to acquire from an exhausted pool within the timeout", async () => {
    const pool = new Pool({
      ...poolConfig("root"),
      connectionString: TEST_DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 200,
    })
    const client = await pool.connect()
    try {
      const start = Date.now()
      await expect(pool.connect()).rejects.toThrow(/timeout/i)
      expect(Date.now() - start).toBeLessThan(1000)
    } finally {
      client.release()
      await pool.end()
    }
  })
})
