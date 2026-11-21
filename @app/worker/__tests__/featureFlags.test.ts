import { poolFromUrl, TEST_DATABASE_URL } from "../../__tests__/helpers"
import { withFeature } from "../src/featureFlags"

import type { FeatureFlagState, FeatureKey } from "@app/lib"
import type { JobHelpers } from "graphile-worker"

// The registry has no keys of its own here; the tests use a key that only
// exists inside their rolled-back transaction.
const KEY = "worker_test_flag" as FeatureKey

function fakeHelpers(query: JobHelpers["query"]) {
  return {
    query,
    logger: { info: jest.fn() },
    job: { task_identifier: "test_task" },
  } as unknown as JobHelpers & { logger: { info: jest.Mock } }
}

describe("withFeature", () => {
  it("runs the task with its payload and helpers when the feature is enabled", async () => {
    const query = jest.fn(async () => ({ rows: [{ enabled: true }] }))
    const helpers = fakeHelpers(query as any)
    const task = jest.fn()

    await withFeature(KEY, task)({ id: 1 }, helpers)

    expect(query).toHaveBeenCalledWith(
      "select app_public.feature_enabled($1) as enabled",
      [KEY]
    )
    expect(task).toHaveBeenCalledWith({ id: 1 }, helpers)
  })

  it("does no work when the feature is off", async () => {
    const query = jest.fn(async () => ({ rows: [{ enabled: false }] }))
    const helpers = fakeHelpers(query as any)
    const task = jest.fn()

    await expect(withFeature(KEY, task)({}, helpers)).resolves.toBeUndefined()

    expect(task).not.toHaveBeenCalled()
    expect(helpers.logger.info).toHaveBeenCalledWith(
      expect.stringContaining(`feature "${KEY}" is off`)
    )
  })

  it("propagates the task's failure so the job is retried", async () => {
    const query = jest.fn(async () => ({ rows: [{ enabled: true }] }))
    const task = jest.fn(async () => {
      throw new Error("boom")
    })

    await expect(
      withFeature(KEY, task)({}, fakeHelpers(query as any))
    ).rejects.toThrow("boom")
  })

  describe("against the database", () => {
    const runWithState = async (
      state: FeatureFlagState | null,
      available = true
    ) => {
      const client = await poolFromUrl(TEST_DATABASE_URL).connect()
      try {
        await client.query("begin")
        if (state) {
          await client.query(
            `insert into app_public.feature_flags (key, state, available, description)
             values ($1, $2, $3, 'Test flag')`,
            [KEY, state, available]
          )
        }
        const task = jest.fn()
        await withFeature(KEY, task)(
          {},
          fakeHelpers((text, values) => client.query(text, values))
        )
        return task.mock.calls.length > 0
      } finally {
        await client.query("rollback")
        client.release()
      }
    }

    it("runs when the flag is on", async () => {
      expect(await runWithState("on")).toBe(true)
    })

    it("treats admins_only as off, since jobs have no session", async () => {
      expect(await runWithState("admins_only")).toBe(false)
    })

    it("skips when the flag is off", async () => {
      expect(await runWithState("off")).toBe(false)
    })

    it("skips when the flag is on but not available", async () => {
      expect(await runWithState("on", false)).toBe(false)
    })

    it("skips for a key without a row", async () => {
      expect(await runWithState(null)).toBe(false)
    })
  })
})
