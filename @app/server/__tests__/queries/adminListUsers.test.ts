import { AdminListUsersDocument } from "@app/graphql"

import {
  createUserAndLogIn,
  deleteTestData,
  runGraphQLQuery,
  setup,
  teardown,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

describe("AdminListUsers", () => {
  test("adminListUsers when logged in as non-admin", async () => {
    const { session } = await createUserAndLogIn()
    await runGraphQLQuery(
      // GraphQL query goes here:
      AdminListUsersDocument,

      // GraphQL variables:
      {},

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
          "Acces denied. Only admins are allowed to use this query."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })

  test("adminListUsers when logged in as admin", async () => {
    const { session } = await createUserAndLogIn({ isAdmin: true })
    await runGraphQLQuery(
      // GraphQL query goes here:
      AdminListUsersDocument,

      // GraphQL variables:
      {},

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()
        expect(json.data!.adminListUsers.nodes.length).toEqual(1)
      }
    )
  })
})
