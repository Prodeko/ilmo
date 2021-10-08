import { DeleteEventDocument } from "@app/graphql"

import {
  asRoot,
  createEventDataAndLogin,
  createUserAndLogIn,
  deleteTestData,
  runGraphQLQuery,
  setup,
  teardown,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

describe("DeleteEvent", () => {
  it("can delete an event as admin", async () => {
    const { events } = await createEventDataAndLogin({
      userOptions: { create: true, isAdmin: false },
    })
    const eventId = events[0].id

    // Session for a different user than the one who created the event.
    // Is an admin so should be able to delete.
    const { session } = await createUserAndLogIn({ isAdmin: true })

    await runGraphQLQuery(
      DeleteEventDocument,

      // GraphQL variables:
      { id: eventId },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(`SELECT * FROM app_public.events WHERE id = $1`, [
            eventId,
          ])
        )

        if (rows.length !== 0) {
          throw new Error("Event not deleted successfully!")
        }

        expect(rows).toEqual([])
      }
    )
  })

  it("can't delete an event while logged in as non admin", async () => {
    const { events } = await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: true },
    })
    const eventId = events[0].id

    // Session for a different user than the one who created the event.
    // Not an admin so should not be able to delete.
    const { session } = await createUserAndLogIn()

    await runGraphQLQuery(
      DeleteEventDocument,

      // GraphQL variables:
      { id: eventId },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()
        const message = json.errors![0].message

        expect(message).toEqual(
          "No values were deleted in collection 'events' because no values you can delete were found matching these criteria."
        )
      }
    )
  })
})
