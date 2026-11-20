import { PoolClient } from "pg"

import {
  asRoot,
  upsertFeatureFlag,
  withAdminUserDb,
  withAnonymousDb,
  withDeveloperUserDb,
  withUserDb,
} from "../../helpers"

const setFeatureFlag = (client: PoolClient, key: string, state: string) =>
  client.query("select * from app_public.set_feature_flag($1, $2)", [
    key,
    state,
  ])

const auditRows = (client: PoolClient, key: string) =>
  asRoot(client, async () => {
    const { rows } = await client.query(
      `select key, old_state, new_state, actor
      from app_private.feature_flag_events
      where key = $1
      order by created_at`,
      [key]
    )
    return rows
  })

describe("app_public.set_feature_flag", () => {
  it("is denied for anonymous users", () =>
    withAnonymousDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "off")
      await expect(
        setFeatureFlag(client, "test_flag", "on")
      ).rejects.toMatchObject({ code: "DNIED" })
    }))

  it("is denied for regular users", () =>
    withUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "off")
      await expect(
        setFeatureFlag(client, "test_flag", "on")
      ).rejects.toMatchObject({ code: "DNIED" })
    }))

  it("is denied for admins who are not developers", () =>
    withAdminUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "off")
      await expect(
        setFeatureFlag(client, "test_flag", "on")
      ).rejects.toMatchObject({ code: "DNIED" })
    }))

  it("lets a developer change the state and records who did it", () =>
    withDeveloperUserDb(async (client, user) => {
      await upsertFeatureFlag(client, "test_flag", "off")

      const {
        rows: [flag],
      } = await setFeatureFlag(client, "test_flag", "admins_only")
      expect(flag.key).toBe("test_flag")
      expect(flag.state).toBe("admins_only")
      expect(flag.updated_by).toBe(user.id)

      await setFeatureFlag(client, "test_flag", "on")

      const {
        rows: [stored],
      } = await client.query(
        "select state, updated_by from app_public.feature_flags where key = $1",
        ["test_flag"]
      )
      expect(stored).toEqual({ state: "on", updated_by: user.id })

      expect(await auditRows(client, "test_flag")).toEqual([
        {
          key: "test_flag",
          old_state: "off",
          new_state: "admins_only",
          actor: user.id,
        },
        {
          key: "test_flag",
          old_state: "admins_only",
          new_state: "on",
          actor: user.id,
        },
      ])
    }))

  it("does not record an audit row when the state does not change", () =>
    withDeveloperUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "on")
      await setFeatureFlag(client, "test_flag", "on")
      expect(await auditRows(client, "test_flag")).toEqual([])
    }))

  it("rejects an unknown key", () =>
    withDeveloperUserDb(async (client) => {
      await expect(
        setFeatureFlag(client, "test_does_not_exist", "on")
      ).rejects.toMatchObject({ code: "NTFND" })
    }))

  it("refuses to enable an unavailable flag", () =>
    withDeveloperUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "off", { available: false })
      await expect(
        setFeatureFlag(client, "test_flag", "admins_only")
      ).rejects.toMatchObject({ code: "FTUNA" })
    }))

  it("still lets a developer switch an unavailable flag off", () =>
    withDeveloperUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "on", { available: false })
      const {
        rows: [flag],
      } = await setFeatureFlag(client, "test_flag", "off")
      expect(flag.state).toBe("off")
    }))

  it("refuses to change a retired flag", () =>
    withDeveloperUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "on", { retired: true })
      await expect(
        setFeatureFlag(client, "test_flag", "off")
      ).rejects.toMatchObject({ code: "DNIED" })
    }))
})

describe("app_public.feature_flag_events", () => {
  it("returns the audit log, newest first, to developers", () =>
    withDeveloperUserDb(async (client, user) => {
      await upsertFeatureFlag(client, "test_flag", "off")
      await upsertFeatureFlag(client, "test_other", "off")
      await setFeatureFlag(client, "test_flag", "on")
      await setFeatureFlag(client, "test_other", "on")

      const { rows } = await client.query(
        "select key, old_state, new_state, actor_id, actor_username from app_public.feature_flag_events($1)",
        ["test_flag"]
      )
      expect(rows).toEqual([
        {
          key: "test_flag",
          old_state: "off",
          new_state: "on",
          actor_id: user.id,
          actor_username: user.username,
        },
      ])

      const { rows: all } = await client.query(
        "select key from app_public.feature_flag_events() where key like 'test_%'"
      )
      expect(all.map((r) => r.key).sort()).toEqual(["test_flag", "test_other"])
    }))

  it("is denied for admins who are not developers", () =>
    withAdminUserDb(async (client) => {
      await expect(
        client.query("select * from app_public.feature_flag_events()")
      ).rejects.toMatchObject({ code: "DNIED" })
    }))
})
