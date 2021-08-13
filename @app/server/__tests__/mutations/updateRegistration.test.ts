import { UpdateEventRegistrationDocument } from "@app/graphql"
import { removePropFromObject } from "@app/lib"

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
        expect(code).toEqual("DNIED")
      }
    )
  })
})
