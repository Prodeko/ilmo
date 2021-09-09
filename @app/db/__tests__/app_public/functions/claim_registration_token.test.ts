import { PoolClient } from "pg"

import { asRoot, createEventData, withUserDb } from "../../helpers"

async function claimToken(
  client: PoolClient,
  eventId: string,
  quotaId: string
) {
  const {
    rows: [row],
  } = await client.query(
    `select * from app_public.claim_registration_token($1, $2)`,
    [eventId, quotaId]
  )
  return row
}

it("can claim registration token and token expires", () =>
  withUserDb(async (client) => {
    jest.useFakeTimers()
    const { event, quota } = await createEventData(client)

    // Action
    await claimToken(client, event.id, quota.id)

    // Assertions
    const {
      rows: [registrationSecret],
    } = await asRoot(client, () =>
      client.query(
        "select * from app_private.registration_secrets where event_id = $1",
        [event.id]
      )
    )
    expect(registrationSecret.event_id).toEqual(event.id)
    expect(registrationSecret.quota_id).toEqual(quota.id)
  }))
