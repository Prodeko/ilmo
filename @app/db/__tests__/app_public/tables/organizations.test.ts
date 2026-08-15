import { PoolClient } from "pg"

import {
  becomeRoot,
  becomeUser,
  withAdminUserDb,
  withUserDb,
} from "../../helpers"

/**
 * An organization nobody is a member of. `createOrganizations` always makes the
 * current user its owner, which is the one thing these tests must not have:
 * the `update_owner` policy would then grant the update and say nothing about
 * `manage_admin`.
 */
async function createUnownedOrganization(
  client: PoolClient,
  user: { id: string }
) {
  await becomeRoot(client)
  const {
    rows: [organization],
  } = await client.query(
    `insert into app_public.organizations (slug, name) values ($1, $2) returning *`,
    ["unowned-org", "Unowned Organization"]
  )
  await becomeUser(client, user.id)
  return organization
}

describe("Test app_public.organizations table", () => {
  const updateName = `update app_public.organizations set name = $1 where id = $2 returning *`

  it("an admin can update an organization they are not a member of", () =>
    withAdminUserDb(async (client, user) => {
      const organization = await createUnownedOrganization(client, user)

      const { rows } = await client.query(updateName, [
        "Renamed By Admin",
        organization.id,
      ])

      expect(rows).toHaveLength(1)
      expect(rows[0].name).toEqual("Renamed By Admin")
    }))

  it("a non-admin who is not a member cannot update an organization", () =>
    withUserDb(async (client, user) => {
      const organization = await createUnownedOrganization(client, user)

      const { rows } = await client.query(updateName, [
        "Renamed By Nobody",
        organization.id,
      ])

      // RLS filters the row out rather than raising, so the update is a no-op.
      expect(rows).toHaveLength(0)

      await becomeRoot(client)
      const {
        rows: [unchanged],
      } = await client.query(
        `select name from app_public.organizations where id = $1`,
        [organization.id]
      )
      expect(unchanged.name).toEqual("Unowned Organization")
    }))

  it("every organization is visible to a non-member", () =>
    withUserDb(async (client, user) => {
      const organization = await createUnownedOrganization(client, user)

      const { rows } = await client.query(
        `select id from app_public.organizations where id = $1`,
        [organization.id]
      )

      expect(rows).toHaveLength(1)
    }))
})
