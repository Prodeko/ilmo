import { PoolClient } from "pg"

import {
  asRoot,
  assertJobComplete,
  createEventData,
  getJobs,
  runJobs,
  withUserDb,
} from "../../helpers"

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

async function getRegistration(client: PoolClient, id: string) {
  const {
    rows: [row],
  } = await asRoot(client, () =>
    client.query("select * from app_public.registrations where id = $1", [id])
  )
  return row
}

it("can claim registration token and token expires", () =>
  withUserDb(async (client) => {
    // "modern" can be removed in Jest 27, it is opt-in in version 26
    jest.useFakeTimers("modern")
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

    const jobs = await getJobs(
      client,
      "registration__schedule_unfinished_registration_delete"
    )
    expect(jobs).toHaveLength(1)
    const [job] = jobs
    expect(job.payload).toMatchObject({
      token: registrationSecret.registration_token,
    })

    // Graphile-worker jobs run as root. We are querying the app_private schema
    // in registration__schedule_unfinished_registration_delete task, so root
    // connection is needed.
    await asRoot(client, async () => {
      // Run the job and assert that the job runs correctly
      await runJobs(client)
      await assertJobComplete(client, job)

      const TEN_MINUTES = 1000 * 10 * 60
      const registrationId = registrationSecret.registration_id

      // Registration should exist in the database after calling claim_registration_token
      const t1 = await getRegistration(client, registrationId)
      expect(t1).toBeTruthy()

      // Registration should still be in the database 1ms before expiration
      jest.advanceTimersByTime(TEN_MINUTES - 1)
      const t2 = await getRegistration(client, registrationId)
      expect(t2).toBeTruthy()

      // Registration should be deleted from db at expiration
      jest.advanceTimersByTime(1)
      const t3 = await getRegistration(client, registrationId)
      expect(t3).toBeUndefined()
    })
  }))
