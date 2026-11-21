import { UpdateEventRegistrationDocument } from "@app/graphql"

import {
  asRoot,
  createEventDataAndLogin,
  deleteTestData,
  poolFromUrl,
  removePropFromObject,
  runGraphQLQuery,
  setup,
  teardown,
  TEST_DATABASE_URL,
} from "../helpers"

// Closes signup of an event created with open signup by moving its end into
// the past. The signup window is checked against NOW() in the database, so
// the end time is set there too.
async function closeSignup(eventId: string) {
  const { rowCount } = await poolFromUrl(TEST_DATABASE_URL).query(
    `update app_public.events
       set registration_end_time = now() - interval '1 minute'
       where id = $1 and registration_start_time < now() - interval '1 minute'`,
    [eventId]
  )
  expect(rowCount).toBe(1)
}

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

describe("UpdateRegistration", () => {
  it("can update a registration with a valid updateToken", async () => {
    const { registrations, registrationSecrets } =
      await createEventDataAndLogin()
    const { update_token: updateToken } = registrationSecrets[0]
    const answers = registrations[0].answers

    await runGraphQLQuery(
      UpdateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          updateToken,
          firstName: "Päivi",
          lastName: "Tetty",
          answers,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: {},
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const updatedRegistration = json.data!.updateRegistration.registration

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.registrations WHERE id = $1`,
            [updatedRegistration.id]
          )
        )

        if (rows.length !== 1) {
          throw new Error("Registration not found!")
        }
        expect(rows[0].id).toEqual(updatedRegistration.id)
        expect(rows[0].first_name).toEqual("Päivi")
        expect(rows[0].last_name).toEqual("Tetty")
      }
    )
  })

  it("can't update registration if registration token is not valid", async () => {
    await runGraphQLQuery(
      UpdateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          // Invalid updateToken
          updateToken: "a7def7b2-1687-48d8-839e-55e57f6ade85",
          firstName: "Päivi",
          lastName: "Tetty",
        },
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

  it("can't update registration if required answers are not provided", async () => {
    const { registrations, registrationSecrets } =
      await createEventDataAndLogin({
        questionOptions: { create: true, amount: 3, required: true },
      })
    const { update_token: updateToken } = registrationSecrets[0]
    const answers = registrations[0].answers

    // Remove one required answer
    const someKey = Object.keys(answers)[0]
    const missingAnswers = removePropFromObject(answers, someKey)

    await runGraphQLQuery(
      UpdateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          updateToken,
          firstName: "Päivi",
          lastName: "Tetty",
          answers: missingAnswers,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: {},
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual("Required question not answered.")
        expect(code).toEqual("NVLID")
      }
    )
  })

  it("can't update registration once event signup has closed", async () => {
    const { events, registrations, registrationSecrets } =
      await createEventDataAndLogin()
    const { update_token: updateToken } = registrationSecrets[0]
    const answers = registrations[0].answers

    await closeSignup(events[0].id)

    await runGraphQLQuery(
      UpdateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          updateToken,
          firstName: "Päivi",
          lastName: "Tetty",
          answers,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual(
          "Updating a registration after event signup has closed is not allowed. Please contact the event organizers."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("admin can update registration after event signup has closed", async () => {
    const { events, registrations, registrationSecrets, session } =
      await createEventDataAndLogin({
        userOptions: {
          create: true,
          amount: 1,
          isVerified: true,
          isAdmin: true,
        },
      })
    const { update_token: updateToken } = registrationSecrets[0]
    const answers = registrations[0].answers

    await closeSignup(events[0].id)

    await runGraphQLQuery(
      UpdateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          updateToken,
          firstName: "Päivi",
          lastName: "Tetty",
          answers,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()

        const { firstName, lastName } =
          json.data!.updateRegistration.registration
        expect(firstName).toEqual("Päivi")
        expect(lastName).toEqual("Tetty")
      }
    )
  })
})
