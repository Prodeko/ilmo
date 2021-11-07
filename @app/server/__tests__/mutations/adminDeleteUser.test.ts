import { AdminDeleteUserDocument } from "@app/graphql"

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

describe("AdminDeleteUser", () => {
  it("can delete a user as an admin user", async () => {
    const { users, session } = await createEventDataAndLogin({
      organizationOptions: { create: false },
      eventCategoryOptions: { create: false },
      eventOptions: { create: false },
      quotaOptions: { create: false },
      questionOptions: { create: false },
      registrationOptions: { create: false },
      userOptions: {
        create: true,
        amount: 2,
        isVerified: true,
        // Is an admin
        isAdmin: true,
      },
    })
    const userId = users[1].id

    await runGraphQLQuery(
      AdminDeleteUserDocument,

      // GraphQL variables:
      { id: userId },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { success } = json.data!.adminDeleteUser
        expect(success).toBeTruthy()

        const { rows: userRows } = await asRoot(pgClient, () =>
          pgClient.query(`SELECT * FROM app_public.users WHERE id = $1`, [
            userId,
          ])
        )

        if (userRows.length !== 0) {
          throw new Error("User not deleted successfully!")
        }

        expect(userRows).toEqual([])
      }
    )
  })

  it("can't delete self via adminDeleteUser mutation", async () => {
    const { users, session } = await createEventDataAndLogin({
      organizationOptions: { create: false },
      eventCategoryOptions: { create: false },
      eventOptions: { create: false },
      quotaOptions: { create: false },
      questionOptions: { create: false },
      registrationOptions: { create: false },
      userOptions: {
        create: true,
        amount: 2,
        isVerified: true,
        // Is an admin
        isAdmin: true,
      },
    })
    const userId = users[0].id

    await runGraphQLQuery(
      AdminDeleteUserDocument,

      // GraphQL variables:
      { id: userId },

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
          "You may not delete yourself via this page. Please delete your account from the account settings page."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })
})
