import { PoolClient } from "pg"

import {
  asRoot,
  upsertFeatureFlag,
  withAdminUserDb,
  withAnonymousDb,
  withDeveloperUserDb,
  withUserDb,
} from "../../helpers"

const selectTestFlags = async (client: PoolClient) => {
  const { rows } = await client.query(
    "select key from app_public.feature_flags where key = 'test_flag'"
  )
  return rows
}

describe("app_public.feature_flags", () => {
  it("is readable by developers", () =>
    withDeveloperUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "on")
      expect(await selectTestFlags(client)).toEqual([{ key: "test_flag" }])
    }))

  it("is not readable by admins who are not developers", () =>
    withAdminUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "on")
      expect(await selectTestFlags(client)).toEqual([])
    }))

  it("is not readable by regular users", () =>
    withUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "on")
      expect(await selectTestFlags(client)).toEqual([])
    }))

  it("is not readable by anonymous users", () =>
    withAnonymousDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "on")
      expect(await selectTestFlags(client)).toEqual([])
    }))

  it("cannot be updated directly, even by developers", () =>
    withDeveloperUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_flag", "off")
      await expect(
        client.query(
          "update app_public.feature_flags set state = 'on' where key = 'test_flag'"
        )
      ).rejects.toThrow("permission denied")
    }))

  it("cannot be inserted into directly, even by developers", () =>
    withDeveloperUserDb(async (client) => {
      await expect(
        client.query(
          "insert into app_public.feature_flags (key, description) values ('test_new', 'x')"
        )
      ).rejects.toThrow("permission denied")
    }))
})

describe("app_public.users.is_developer", () => {
  it("cannot be set by a user on themselves", () =>
    withAdminUserDb(async (client, user) => {
      await expect(
        client.query(
          "update app_public.users set is_developer = true where id = $1",
          [user.id]
        )
      ).rejects.toThrow("permission denied")
    }))

  it("is readable and defaults to false", () =>
    withUserDb(async (client, user) => {
      const {
        rows: [row],
      } = await client.query(
        "select is_developer from app_public.users where id = $1",
        [user.id]
      )
      expect(row.is_developer).toBe(false)
    }))

  it("makes current_user_is_developer true only together with is_admin", () =>
    withDeveloperUserDb(async (client, user) => {
      const isDeveloper = async () =>
        (
          await client.query(
            "select app_public.current_user_is_developer() as v"
          )
        ).rows[0].v
      expect(await isDeveloper()).toBe(true)

      await asRoot(client, () =>
        client.query(
          "update app_public.users set is_admin = false where id = $1",
          [user.id]
        )
      )
      expect(await isDeveloper()).toBe(false)
    }))
})
