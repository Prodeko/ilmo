import { PoolClient } from "pg"

import {
  upsertFeatureFlag,
  withAdminUserDb,
  withAnonymousDb,
  withUserDb,
} from "../../helpers"

const previewFeatures = async (client: PoolClient) => {
  const { rows } = await client.query(
    "select key from app_public.admin_preview_features() as key"
  )
  return rows.map((r) => r.key as string)
}

const seedFlags = async (client: PoolClient) => {
  await upsertFeatureFlag(client, "test_off", "off")
  await upsertFeatureFlag(client, "test_admins_only", "admins_only")
  await upsertFeatureFlag(client, "test_on", "on")
  await upsertFeatureFlag(client, "test_unavailable", "admins_only", {
    available: false,
  })
  await upsertFeatureFlag(client, "test_retired", "admins_only", {
    retired: true,
  })
}

describe("app_public.admin_preview_features", () => {
  it("lists only available, unretired admins_only keys to admins", () =>
    withAdminUserDb(async (client) => {
      await seedFlags(client)
      const keys = await previewFeatures(client)
      expect(keys).toContain("test_admins_only")
      expect(keys).not.toContain("test_off")
      expect(keys).not.toContain("test_on")
      expect(keys).not.toContain("test_unavailable")
      expect(keys).not.toContain("test_retired")
    }))

  it("is empty for regular users", () =>
    withUserDb(async (client) => {
      await seedFlags(client)
      expect(await previewFeatures(client)).toEqual([])
    }))

  it("is empty for anonymous users", () =>
    withAnonymousDb(async (client) => {
      await seedFlags(client)
      expect(await previewFeatures(client)).toEqual([])
    }))
})
