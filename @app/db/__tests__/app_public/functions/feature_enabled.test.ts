import { PoolClient } from "pg"

import {
  becomeUser,
  createUsers,
  upsertFeatureFlag,
  withAdminUserDb,
  withAnonymousDb,
  withRootDb,
  withUserDb,
} from "../../helpers"

const isEnabled = async (client: PoolClient, key: string) => {
  const {
    rows: [row],
  } = await client.query("select app_public.feature_enabled($1) as enabled", [
    key,
  ])
  return row.enabled as boolean
}

const enabledFeatures = async (client: PoolClient) => {
  const { rows } = await client.query(
    "select key from app_public.enabled_features() as key"
  )
  return rows.map((r) => r.key as string)
}

const seedFlags = async (client: PoolClient) => {
  await upsertFeatureFlag(client, "test_off", "off")
  await upsertFeatureFlag(client, "test_admins_only", "admins_only")
  await upsertFeatureFlag(client, "test_on", "on")
  await upsertFeatureFlag(client, "test_unavailable", "on", {
    available: false,
  })
  await upsertFeatureFlag(client, "test_retired", "off", {
    available: false,
    retired: true,
  })
}

describe("app_public.feature_enabled", () => {
  it("reads an unknown key as off", () =>
    withAdminUserDb(async (client) => {
      expect(await isEnabled(client, "test_does_not_exist")).toBe(false)
    }))

  it("reads an off flag as off, also for admins", () =>
    withAdminUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_off", "off")
      expect(await isEnabled(client, "test_off")).toBe(false)
    }))

  it("reads an on flag as on for anonymous users", () =>
    withAnonymousDb(async (client) => {
      await upsertFeatureFlag(client, "test_on", "on")
      expect(await isEnabled(client, "test_on")).toBe(true)
    }))

  it("enables an admins_only flag for admins only", () =>
    withRootDb(async (client) => {
      await upsertFeatureFlag(client, "test_admins_only", "admins_only")
      const [user, admin] = [
        ...(await createUsers(client, 1)),
        ...(await createUsers(client, 1, true, true)),
      ]

      await becomeUser(client, admin.id)
      expect(await isEnabled(client, "test_admins_only")).toBe(true)

      await becomeUser(client, user.id)
      expect(await isEnabled(client, "test_admins_only")).toBe(false)

      await becomeUser(client, null)
      expect(await isEnabled(client, "test_admins_only")).toBe(false)
    }))

  it("reads an unavailable flag as off even when its state is on", () =>
    withAdminUserDb(async (client) => {
      await upsertFeatureFlag(client, "test_unavailable", "on", {
        available: false,
      })
      expect(await isEnabled(client, "test_unavailable")).toBe(false)
    }))

  it("reads a retired flag as on whatever its state and availability", () =>
    withAnonymousDb(async (client) => {
      await upsertFeatureFlag(client, "test_retired", "off", {
        available: false,
        retired: true,
      })
      expect(await isEnabled(client, "test_retired")).toBe(true)
    }))
})

describe("app_public.enabled_features", () => {
  it("lists only keys enabled for everyone to anonymous users", () =>
    withAnonymousDb(async (client) => {
      await seedFlags(client)
      const keys = await enabledFeatures(client)
      expect(keys).toEqual(expect.arrayContaining(["test_on", "test_retired"]))
      expect(keys).not.toContain("test_off")
      expect(keys).not.toContain("test_admins_only")
      expect(keys).not.toContain("test_unavailable")
    }))

  it("lists only keys enabled for everyone to regular users", () =>
    withUserDb(async (client) => {
      await seedFlags(client)
      const keys = await enabledFeatures(client)
      expect(keys).toContain("test_on")
      expect(keys).not.toContain("test_admins_only")
    }))

  it("adds admins_only keys for admins", () =>
    withAdminUserDb(async (client) => {
      await seedFlags(client)
      const keys = await enabledFeatures(client)
      expect(keys).toEqual(
        expect.arrayContaining(["test_on", "test_retired", "test_admins_only"])
      )
      expect(keys).not.toContain("test_off")
      expect(keys).not.toContain("test_unavailable")
    }))
})
