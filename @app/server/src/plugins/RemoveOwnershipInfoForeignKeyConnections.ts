import { PgEntity, PgEntityKind } from "graphile-build-pg"
import { makePgSmartTagsPlugin, Plugin } from "postgraphile"

/**
 * This plugin removes all foreign key connections generated
 * by ownership information (created_by, updated_by) columns.
 * For example, remove userByCreatedBy from event and
 * eventCategoriesByCreatedBy from currentUser.
 */
const RemoveOwnershipInfoForeignKeyConnections: Plugin = makePgSmartTagsPlugin({
  kind: PgEntityKind.CONSTRAINT,
  match: ({ name }: PgEntity) => /created_by_fkey|updated_by_fkey/.test(name),
  tags: {
    omit: true,
  },
})

export default RemoveOwnershipInfoForeignKeyConnections
