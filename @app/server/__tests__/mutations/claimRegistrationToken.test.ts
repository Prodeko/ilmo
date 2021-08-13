import { ClaimRegistrationTokenDocument } from "@app/graphql"

import {
  asRoot,
  createEventDataAndLogin,
  deleteTestData,
  runGraphQLQuery,
  setup,
  teardown,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

describe("ClaimRegistrationToken", () => {
  it("can claim a registration token", async () => {
    const { events, quotas } = await createEventDataAndLogin()
    const eventId = events[0].id
    const quotaId = quotas[0].id

    await runGraphQLQuery(
      ClaimRegistrationTokenDocument,

      // GraphQL variables:
      {
        eventId,
        quotaId,
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json, { pgClient, redisClient, req }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const registrationSecrets =
          json.data!.claimRegistrationToken.claimRegistrationTokenOutput

        const { registrationToken } = registrationSecrets
        const { rows: secretRows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_private.registration_secrets WHERE registration_token = $1`,
            [registrationToken]
          )
        )

        if (secretRows.length !== 1) {
          throw new Error("Token not found!")
        }
        // Database should contain new row in registration_secret
        expect(secretRows[0].registration_token).toEqual(registrationToken)

        const registrationId = secretRows[0].registration_id

        const { rows: registrationRows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.registrations WHERE id = $1`,
            [registrationId]
          )
        )

        if (registrationRows.length !== 1) {
          throw new Error("Registration not found!")
        }
        // Database should contain new row in registrations
        expect(registrationRows[0].event_id).toEqual(eventId)
        expect(registrationRows[0].quota_id).toEqual(quotaId)
        expect(registrationRows[0].first_name).toBeNull()
        expect(registrationRows[0].last_name).toBeNull()
        expect(registrationRows[0].email).toBeNull()

        const rateLimitId = `${eventId}:${quotaId}`
        const redisKey = `rate-limit:claimRegistrationToken:${rateLimitId}:${req.ip}`
        const value = await redisClient.get(redisKey)

        // Redis should contain rate limit value after calling
        // claimRegistrationToken mutation
        expect(value).toEqual("1")
      }
    )
  })

  it("can't claim a token when eventId is incorrect", async () => {
    const { quotas } = await createEventDataAndLogin()
    const quotaId = quotas[0].id

    await runGraphQLQuery(
      ClaimRegistrationTokenDocument,

      // GraphQL variables:
      {
        // Incorrect event id
        eventId: "a3eb914e-90d8-4597-9852-67aad0623c64",
        quotaId,
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual("Invalid event id.")
        expect(code).toEqual("NTFND")
      }
    )
  })

  it("can't claim a token when quotaId is incorrect", async () => {
    const { events } = await createEventDataAndLogin()
    const eventId = events[0].id

    await runGraphQLQuery(
      ClaimRegistrationTokenDocument,

      // GraphQL variables:
      {
        // Incorrect event id
        eventId,
        quotaId: "e4ba8648-7e5a-4d6c-85ba-e668c3d5d3ae",
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual("Invalid event or quota id.")
        expect(code).toEqual("NTFND")
      }
    )
  })

  it("can't claim a token when eventId and quotaId don't match", async () => {
    const { events, quotas } = await createEventDataAndLogin({
      eventOptions: { create: true, amount: 2 },
    })
    const anotherEventId = events[1].id
    const quotaId = quotas[0].id

    await runGraphQLQuery(
      ClaimRegistrationTokenDocument,

      // GraphQL variables:
      {
        // Incorrect event id
        eventId: anotherEventId,
        quotaId,
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual("Invalid event or quota id.")
        expect(code).toEqual("NTFND")
      }
    )
  })
})
