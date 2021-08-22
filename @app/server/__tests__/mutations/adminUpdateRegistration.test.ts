import { AdminUpdateRegistrationDocument } from "@app/graphql"

import {
  createEventDataAndLogin,
  deleteTestData,
  runGraphQLQuery,
  setup,
  teardown,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

describe("AdminUpdateRegistration", () => {
  it("can get an updateToken related to a registration if the user is an admin", async () => {
    const { registrations, registrationSecrets, session } =
      await createEventDataAndLogin({
        userOptions: {
          create: true,
          amount: 1,
          isVerified: true,
          // Is an admin
          isAdmin: true,
        },
      })
    const registrationId = registrations[0].id
    const secretUpdateToken = registrationSecrets[0].update_token

    await runGraphQLQuery(
      AdminUpdateRegistrationDocument,

      // GraphQL variables:
      { input: { id: registrationId } },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { updateToken } = json.data!.adminUpdateRegistration
        expect(updateToken).toEqual(secretUpdateToken)
      }
    )
  })

  it("can't get an updateToken related to a registration if the user is not an admin", async () => {
    const { registrations, session } = await createEventDataAndLogin({
      userOptions: {
        create: true,
        amount: 1,
        isVerified: true,
        // Not an admin
        isAdmin: false,
      },
    })
    const registrationId = registrations[0].id

    await runGraphQLQuery(
      AdminUpdateRegistrationDocument,

      // GraphQL variables:
      { input: { id: registrationId } },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual(
          "Acces denied. Only admins are allowed to use this mutation."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("returns an error if registration is not found", async () => {
    const { session } = await createEventDataAndLogin({
      userOptions: {
        create: true,
        amount: 1,
        isVerified: true,
        // Is an admin
        isAdmin: true,
      },
    })

    await runGraphQLQuery(
      AdminUpdateRegistrationDocument,

      // Invalid registration id
      { input: { id: "0651d6b4-eda4-417f-acd4-e9c32d16bea3" } },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual("Registration was not found.")
        expect(code).toEqual("NTFND")
      }
    )
  })
})
