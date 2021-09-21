import {
  createEventCategories,
  createEvents,
  createOrganizations,
  withUserDb,
} from "../../helpers"

describe("Test app_public.quotas table", () => {
  const commonQuery = `
    insert into app_public.quotas(
      event_id,
      position,
      title,
      size
    )
    values ($1, $2, $3, $4)
    returning *
  `

  for (const iter of [
    ["position", [-1]],
    ["size", [-1, 0]],
  ]) {
    const [type, invalidValues] = iter
    for (const val of invalidValues as number[]) {
      it(`cannot create a quota with ${type} <= ${val}`, () =>
        withUserDb(async (client) => {
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

          const promise = client.query(commonQuery, [
            event.id,
            type === "position" ? val : 0,
            {
              fi: "Testikiintiö",
              en: "Test quota",
            },
            // Should not be able to create a quota where size = -1
            type === "size" ? val : 1,
          ])
          await expect(promise).rejects.toThrow(
            `new row for relation "quotas" violates check constraint "quotas_${type}_check"`
          )
        }))
    }
  }
})
