import { PoolClient } from "pg"

import {
  becomeRoot,
  createEventCategories,
  createEvents,
  createOrganizations,
  createQuotas,
  createRegistrations,
  deleteTestData,
  withUserDb,
} from "../../helpers"

async function setupData(client: PoolClient, opts) {
  const { openQuotaSize, numQuotas, quotaSize } = opts
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
    eventCategory.id,
    true, // signupOpen
    false, // isDraft
    openQuotaSize // openQuotaSize
  )
  // 2 quotas with size 1
  const quotas = await createQuotas(client, numQuotas, event.id, quotaSize)
  await becomeRoot(client)
  return { event, quotas }
}
beforeEach(deleteTestData)

describe("registrations_status_and_position", () => {
  it("SIMPLE CASE: shows correct rank and position for registrations", () =>
    withUserDb(async (client) => {
      // Spots in quotas: 1 + open quota: 1 = total spots: 2
      // Create 3 registrations, one should be in queue

      const { event, quotas } = await setupData(client, {
        openQuotaSize: 1,
        numQuotas: 1,
        quotaSize: 1,
      })
      const registrations = []

      for (let i = 0; i < 3; i++) {
        const [reg] = await createRegistrations(
          client,
          1,
          event.id,
          quotas[0].id,
          []
        )
        // Commit the db transaction to get different timestamps for created_at. It is populated
        // with NOW() which returns the timestamp at the beginning of the transaction.
        await client.query("commit")
        registrations.push(reg)
      }
      const { rows: statusAndPos } = await client.query(
        "select * from app_hidden.registrations_status_and_position"
      )
      const sorted = []
      registrations.forEach((r) => {
        sorted.push(statusAndPos.find((reg) => reg.id === r.id))
      })

      expect(sorted[0].id).toEqual(registrations[0].id)
      expect(sorted[1].id).toEqual(registrations[1].id)
      expect(sorted[2].id).toEqual(registrations[2].id)

      expect(sorted[0].status).toEqual("IN_QUOTA")
      expect(sorted[1].status).toEqual("IN_OPEN_QUOTA")
      expect(sorted[2].status).toEqual("IN_QUEUE")

      expect(sorted[0].position).toEqual(1)
      expect(sorted[1].position).toEqual(1)
      expect(sorted[2].position).toEqual(1)
    }))

  it("COMPLEX CASE: shows correct rank and position for registrations", () =>
    withUserDb(async (client) => {
      // Spots in quotas: 4 + open quota: 2 = total spots: 6
      // Create 10 registrations, 7 for the first quota and 3 for the second quota
      // Both quotas should be filled and 4 people should be in queue

      const { event, quotas } = await setupData(client, {
        openQuotaSize: 2,
        numQuotas: 2,
        quotaSize: 2,
      })

      const registrations = []
      // Fill quota 1 (size 2) and one open spot
      for (let i = 0; i < 7; i++) {
        const [reg] = await createRegistrations(
          client,
          1,
          event.id,
          // First quota
          quotas[0].id,
          []
        )
        // Commit the db transaction to get different timestamps for created_at. It is populated
        // with NOW() which returns the timestamp at the beginning of the transaction.
        await client.query("commit")
        registrations.push(reg)
      }

      // Fill quota 2 (size 2) and one open spot
      for (let i = 0; i < 3; i++) {
        const [reg] = await createRegistrations(
          client,
          1,
          event.id,
          // Second quota
          quotas[1].id,
          []
        )
        // Commit the db transaction to get different timestamps for created_at. It is populated
        // with NOW() which returns the timestamp at the beginning of the transaction.
        await client.query("commit")
        registrations.push(reg)
      }
      const { rows: statusAndPos } = await client.query(
        "select * from app_hidden.registrations_status_and_position"
      )
      const sorted = []
      registrations.forEach((r) => {
        sorted.push(statusAndPos.find((reg) => reg.id === r.id))
      })

      // Check that id's are ordered
      sorted.forEach((s, i) => {
        expect(s.id).toEqual(registrations[i].id)
      })

      // Quota 1
      expect(sorted[0].status).toEqual("IN_QUOTA")
      expect(sorted[1].status).toEqual("IN_QUOTA")
      expect(sorted[2].status).toEqual("IN_OPEN_QUOTA")
      expect(sorted[3].status).toEqual("IN_OPEN_QUOTA")
      expect(sorted[4].status).toEqual("IN_QUEUE")
      expect(sorted[5].status).toEqual("IN_QUEUE")
      expect(sorted[6].status).toEqual("IN_QUEUE")

      expect(sorted[0].position).toEqual(1)
      expect(sorted[1].position).toEqual(2)
      expect(sorted[2].position).toEqual(1)
      expect(sorted[3].position).toEqual(2)
      expect(sorted[4].position).toEqual(1)
      expect(sorted[5].position).toEqual(2)
      expect(sorted[6].position).toEqual(3)

      // Quota 2
      expect(sorted[7].status).toEqual("IN_QUOTA")
      expect(sorted[8].status).toEqual("IN_QUOTA")
      expect(sorted[9].status).toEqual("IN_QUEUE")

      expect(sorted[7].position).toEqual(1)
      expect(sorted[8].position).toEqual(2)
      expect(sorted[9].position).toEqual(4)
    }))
})
