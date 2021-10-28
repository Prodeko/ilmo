import { DeleteEventCategoryDocument } from "@app/graphql"

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

describe("DeleteEventCategory", () => {
  it("can delete an event category as admin", async () => {
    const { eventCategory } = await createEventDataAndLogin({
      eventOptions: { create: false },
      quotaOptions: { create: false },
      questionOptions: { create: false },
      registrationOptions: { create: false },
      userOptions: { create: true, isAdmin: false },
    })
    const categoryId = eventCategory.id

    // Different user and session than the one who created the event category.
    // The user is admin so should be able to delete.
    const { session } = await createUserAndLogIn({ isAdmin: true })

    await runGraphQLQuery(
      DeleteEventCategoryDocument,

      // GraphQL variables:
      { id: categoryId },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.event_categories WHERE id = $1`,
            [categoryId]
          )
        )

        if (rows.length !== 0) {
          throw new Error("Event category not deleted successfully!")
        }

        expect(rows).toEqual([])
      }
    )
  })

  it("can't delete an event category while logged in as non admin", async () => {
    const { eventCategory } = await createEventDataAndLogin({
      eventOptions: { create: false },
      quotaOptions: { create: false },
      questionOptions: { create: false },
      registrationOptions: { create: false },
      userOptions: { create: true, isAdmin: false },
    })
    const categoryId = eventCategory.id

    // Session for a different user than the one who created the event category.
    // Should not be able to delete.
    const { session } = await createUserAndLogIn({ isAdmin: false })

    await runGraphQLQuery(
      DeleteEventCategoryDocument,

      // GraphQL variables:
      { id: categoryId },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()
        const message = json.errors![0].message

        expect(message).toEqual(
          "No values were deleted in collection 'event_categories' because no values you can delete were found matching these criteria."
        )
      }
    )
  })
})
