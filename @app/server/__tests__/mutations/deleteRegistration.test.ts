import { DeleteEventRegistrationDocument } from "@app/graphql"
import dayjs from "dayjs"

import {
  asRoot,
  assertJobComplete,
  claimRegistrationToken,
  createEventDataAndLogin,
  deleteTestData,
  getEmails,
  getJobs,
  poolFromUrl,
  runGraphQLQuery,
  runJobs,
  setup,
  sleep,
  teardown,
  TEST_DATABASE_URL,
} from "../helpers"

// Registrations created in one transaction share created_at, so their order
// is read from the positions table instead of assumed from creation order.
async function registrationIdsByStatus(eventId: string) {
  const { rows } = await poolFromUrl(TEST_DATABASE_URL!).query(
    `select id, status
      from app_hidden.registrations_status_and_position
      where event_id = $1`,
    [eventId]
  )
  const idsWith = (status: string) =>
    rows.filter((row) => row.status === status).map((row) => row.id)
  return {
    inQuota: idsWith("IN_QUOTA"),
    inOpenQuota: idsWith("IN_OPEN_QUOTA"),
    inQueue: idsWith("IN_QUEUE"),
  }
}

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

describe("DeleteRegistration", () => {
  it("can delete a registration with a valid updateToken", async () => {
    const { registrationSecrets } = await createEventDataAndLogin()
    const { update_token: updateToken, registration_id: registrationId } =
      registrationSecrets[0]

    await runGraphQLQuery(
      DeleteEventRegistrationDocument,

      // GraphQL variables:
      { updateToken },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: {},
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { success } = json.data!.deleteRegistration
        expect(success).toBeTruthy()

        const { rows: registrationRows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.registrations WHERE id = $1`,
            [registrationId]
          )
        )
        const { rows: secretRows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_private.registration_secrets WHERE registration_id = $1`,
            [registrationId]
          )
        )

        if (registrationRows.length !== 0) {
          throw new Error("Registration not deleted successfully!")
        }
        if (secretRows.length !== 0) {
          throw new Error("Registration secrets not deleted successfully!")
        }

        expect(registrationRows).toEqual([])
        expect(secretRows).toEqual([])
      }
    )
  })

  it("can't delete registration if registration token is not valid", async () => {
    await runGraphQLQuery(
      DeleteEventRegistrationDocument,

      // GraphQL variables:
      {
        // Invalid updateToken
        updateToken: "e22951b1-d9b2-4a3c-a827-5c512b935be2",
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual("Registration matching token was not found.")
        expect(code).toEqual("NTFND")
      }
    )
  })

  it("can't delete registration once event signup has closed", async () => {
    // We cannot use jest.useFakeTimers() here since we are depending on
    // database level date function such as NOW(). Instead we create a new evet
    // where the registration is only open for 1 second, create a registration,
    // sleep for 1 second and then try to delete the registration. This should
    // not be allowed, since registrations are only allowed to be deleted
    // if the event signup is still open.
    const now = dayjs()
    const registrationStartTime = dayjs(now).toDate()
    const registrationEndTime = dayjs(registrationStartTime)
      .add(1, "second")
      .toDate()
    const eventStartTime = dayjs(registrationEndTime).add(7, "day").toDate()
    const eventEndTime = dayjs(eventStartTime).add(7, "day").toDate()
    const times = [
      registrationStartTime,
      registrationEndTime,
      eventStartTime,
      eventEndTime,
    ]
    const { events, quotas } = await createEventDataAndLogin({
      eventOptions: { create: true, times },
    })
    const { updateToken } = await claimRegistrationToken(
      events[0].id,
      quotas[0].id
    )

    await sleep(1000)

    await runGraphQLQuery(
      DeleteEventRegistrationDocument,

      // GraphQL variables:
      {
        updateToken,
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual(
          "Deleting a registration after event signup has closed is not allowed. Please contact the event organizers."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("sends an email to the next person in queue when a registration is deleted from a normal quota", async () => {
    const { events, registrations, registrationSecrets } =
      await createEventDataAndLogin({
        registrationOptions: { create: true, amount: 3 },
        quotaOptions: { create: true, amount: 1, size: 2 },
      })
    const event = events[0]
    const {
      inQuota: [leavingId],
      inQueue: [queuedId],
    } = await registrationIdsByStatus(event.id)
    const receivedSpot = registrations.find((r) => r.id === queuedId)!
    const updateToken = registrationSecrets.find(
      (secret) => secret.registration_id === leavingId
    )!.update_token

    await runGraphQLQuery(
      DeleteEventRegistrationDocument,

      // GraphQL variables:
      { updateToken },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: {},
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { success } = json.data!.deleteRegistration
        expect(success).toBeTruthy()

        const jobs = await getJobs(pgClient, "registration__process_queue")
        expect(jobs).toHaveLength(1)
        const [job] = jobs
        expect(job.payload).toMatchObject({
          receivedSpot: {
            id: receivedSpot.id,
            event_id: receivedSpot.event_id,
            quota_id: receivedSpot.quota_id,
            status: "IN_QUOTA",
          },
        })

        // Run the job and assert that the job runs correctly
        await runJobs(pgClient)
        await assertJobComplete(pgClient, job)

        // Check that the email was sent
        const emails = getEmails()
        expect(emails).toHaveLength(1)
        const [email] = emails
        expect(email.envelope.to).toEqual([receivedSpot.email])
        const message = JSON.parse(email.message)
        expect(message.subject).toEqual(
          `${event.name.fi} - Olet saanut paikan jonosta`
        )
      }
    )
  })

  it("sends an email to the next person in queue when a registration is deleted from an open quota", async () => {
    const { events, registrations, registrationSecrets } =
      await createEventDataAndLogin({
        eventOptions: { create: true, amount: 1, openQuotaSize: 1 },
        quotaOptions: { create: true, amount: 1, size: 1 },
        registrationOptions: { create: true, amount: 3 },
      })
    const event = events[0]
    const {
      inOpenQuota: [leavingId],
      inQueue: [queuedId],
    } = await registrationIdsByStatus(event.id)
    const receivedSpot = registrations.find((r) => r.id === queuedId)!
    const updateToken = registrationSecrets.find(
      (secret) => secret.registration_id === leavingId
    )!.update_token

    await runGraphQLQuery(
      DeleteEventRegistrationDocument,

      // GraphQL variables:
      { updateToken },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: {},
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { success } = json.data!.deleteRegistration
        expect(success).toBeTruthy()

        const jobs = await getJobs(pgClient, "registration__process_queue")
        expect(jobs).toHaveLength(1)
        const [job] = jobs
        expect(job.payload).toMatchObject({
          receivedSpot: {
            id: receivedSpot.id,
            event_id: receivedSpot.event_id,
            quota_id: receivedSpot.quota_id,
            status: "IN_OPEN_QUOTA",
            position: 1,
          },
        })

        // Run the job and assert that the job runs correctly
        await runJobs(pgClient)
        await assertJobComplete(pgClient, job)

        // Check that the email was sent
        const emails = getEmails()
        expect(emails).toHaveLength(1)
        const [email] = emails
        expect(email.envelope.to).toEqual([receivedSpot.email])
        const message = JSON.parse(email.message)
        expect(message.subject).toEqual(
          `${event.name.fi} - Olet saanut paikan jonosta`
        )
      }
    )
  })
})
