import {
  createEventCategories,
  createEvents,
  createOrganizations,
  createQuotas,
  withAdminUserDb,
} from "../../helpers"

describe("Test app_public.update_event_quotas function", () => {
  it("deletes an omitted quota also when the same call adds a new quota", () =>
    withAdminUserDb(async (client) => {
      const [organization] = await createOrganizations(client, 1)
      const [eventCategory] = await createEventCategories(
        client,
        1,
        organization.id
      )
      const [event] = await createEvents(
        client,
        1,
        organization.id,
        eventCategory.id
      )
      const [keptQuota, removedQuota] = await createQuotas(client, 2, event.id)

      // The admin UI sends kept quotas with their ids and newly added quotas
      // without an id. removedQuota is omitted, so it should be deleted.
      await client.query(
        `select app_public.update_event_quotas(
          $1,
          array[
            row($2::uuid, 0::smallint, $3::jsonb, 5::smallint),
            row(null, 1::smallint, $4::jsonb, 10::smallint)
          ]::app_public.update_event_quotas[]
        )`,
        [
          event.id,
          keptQuota.id,
          keptQuota.title,
          { fi: "Uusi kiintiö", en: "New quota" },
        ]
      )

      const { rows: quotas } = await client.query(
        `select id from app_public.quotas where event_id = $1 order by position`,
        [event.id]
      )
      const quotaIds = quotas.map((q) => q.id)

      expect(quotaIds).toHaveLength(2)
      expect(quotaIds).toContain(keptQuota.id)
      expect(quotaIds).not.toContain(removedQuota.id)
    }))
})
