import { SetAdminStatusDocument } from "@app/graphql"

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

describe("SetAdminStatus", () => {
  it("can toggle the admin status of a user as an admin user", async () => {
    const { session } = await createEventDataAndLogin({
      userOptions: {
        create: true,
        amount: 1,
        isVerified: true,
        // Is an admin, used to update the admin status of the user created next
        isAdmin: true,
      },
    })
    const { users } = await createEventDataAndLogin({
      userOptions: {
        create: true,
        amount: 1,
        isVerified: true,
        // Is not an admin
        isAdmin: false,
      },
    })
    const nonAdminUserId = users[0].id

    await runGraphQLQuery(
      SetAdminStatusDocument,

      // GraphQL variables:
      { input: { id: nonAdminUserId, isAdmin: true } },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { success } = json.data!.setAdminStatus
        expect(success).toBeTruthy()

        const {
          rows: [user],
        } = await asRoot(pgClient, () =>
          pgClient.query(`SELECT * FROM app_public.users WHERE id = $1`, [
            nonAdminUserId,
          ])
        )

        expect(user.id).toEqual(nonAdminUserId)
        expect(user.is_admin).toEqual(true)
      }
    )
  })

  it("can't update own admin status via setAdminStatus", async () => {
    const { users, session } = await createEventDataAndLogin({
      userOptions: {
        create: true,
        amount: 1,
        isVerified: true,
        // Is an admin
        isAdmin: true,
      },
    })
    const userId = users[0].id

    await runGraphQLQuery(
      SetAdminStatusDocument,

      // GraphQL variables:
      { input: { id: userId, isAdmin: false } },

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
          "You may not change your own admin status via this mutation."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("can't toggle the admin status of a user if not logged in as admin", async () => {
    const { users: nonAdminUsers, session } = await createEventDataAndLogin({
      userOptions: {
        create: true,
        amount: 2,
        isVerified: true,
        // Is not an admin
        isAdmin: false,
      },
    })
    const anotherUser = nonAdminUsers[1]

    await runGraphQLQuery(
      SetAdminStatusDocument,

      // GraphQL variables:
      { input: { id: anotherUser.id, isAdmin: true } },

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
})
