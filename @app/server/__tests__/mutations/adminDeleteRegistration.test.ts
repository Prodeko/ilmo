import { AdminDeleteRegistrationDocument } from "@app/graphql"

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

describe("AdminDeleteRegistration", () => {
  it("can delete a registration as an admin user", async () => {
    const { registrations, session } = await createEventDataAndLogin({
      userOptions: {
        create: true,
        amount: 1,
        isVerified: true,
        // Is an admin
        isAdmin: true,
      },
    })
    const registrationId = registrations[0].id

    await runGraphQLQuery(
      AdminDeleteRegistrationDocument,

      // GraphQL variables:
      { input: { id: registrationId } },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { success } = json.data!.adminDeleteRegistration
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

  it("can't delete registration if user is not an admin", async () => {
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
      AdminDeleteRegistrationDocument,

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
      AdminDeleteRegistrationDocument,

      // Invalid registration id
      { input: { id: "49f87ff3-2e82-4d88-8053-275dcdace9f5" } },

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
