import {
  upsertFeatureFlag,
  withDeveloperUserDb,
  withRootDb,
} from "../../helpers"

describe("app_private.set_feature_available", () => {
  it("sets availability without touching the state change timestamp", () =>
    withRootDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "on")
      await client.query(
        "update app_public.feature_flags set updated_at = '2020-01-01T00:00:00Z' where key = 'test_flag'"
      )

      const {
        rows: [{ found }],
      } = await client.query(
        "select app_private.set_feature_available('test_flag', false) as found"
      )
      expect(found).toBe(true)

      const {
        rows: [flag],
      } = await client.query(
        "select available, state, updated_at from app_public.feature_flags where key = 'test_flag'"
      )
      expect(flag.available).toBe(false)
      expect(flag.state).toBe("on")
      expect(flag.updated_at.toISOString()).toBe(
        new Date("2020-01-01").toISOString()
      )

      const {
        rows: [{ enabled }],
      } = await client.query(
        "select app_public.feature_enabled('test_flag') as enabled"
      )
      expect(enabled).toBe(false)
    }))

  it("returns false for an unknown key", () =>
    withRootDb(async (client) => {
      const {
        rows: [{ found }],
      } = await client.query(
        "select app_private.set_feature_available('test_does_not_exist', true) as found"
      )
      expect(found).toBe(false)
    }))

  it("cannot be called by the visitor role, even by developers", () =>
    withDeveloperUserDb(async (client) => {
      await expect(
        client.query(
          "select app_private.set_feature_available('test_flag', true)"
        )
      ).rejects.toThrow("permission denied")
    }))
})
