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

const deleteEventCategoryMutation = `
mutation DeleteEventCategory($categoryId: UUID!) {
  deleteEventCategory(input: { id: $categoryId }) {
    clientMutationId
  }
}`

describe("DeleteEventCategory", () => {
  it("admin can delete an event category (RLS policy)", async () => {
    const { eventCategory } = await createEventDataAndLogin({
      eventOptions: { create: false },
      quotaOptions: { create: false },
      registrationOptions: { create: false },
      registrationSecretOptions: { create: false },
      userOptions: { create: true, isAdmin: true },
    })
    const categoryId = eventCategory.id

    // Different user and session than the one who created the event catregories.
    // The user is admin so should be able to delete.
    const { session } = await createUserAndLogIn({ isAdmin: true })

    await runGraphQLQuery(
      deleteEventCategoryMutation,

      // GraphQL variables:
      { categoryId },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {
        user: { session_id: session.uuid },
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

  it("member of the owner organization for the related event can delete an event category (RLS policy)", async () => {
    const { eventCategory, session } = await createEventDataAndLogin({
      eventOptions: { create: false },
      quotaOptions: { create: false },
      registrationOptions: { create: false },
      registrationSecretOptions: { create: false },
      userOptions: { create: true, isAdmin: false },
    })
    const categoryId = eventCategory.id

    await runGraphQLQuery(
      deleteEventCategoryMutation,

      // GraphQL variables:
      { categoryId },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {
        user: { session_id: session.uuid },
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

  it("users without the right permissions cannot delete event categories (RLS policy)", async () => {
    const { eventCategory } = await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: true },
    })
    const categoryId = eventCategory.id

    // Session for a different user than the one who created the event category.
    // Should not be able to delete.
    const { session } = await createUserAndLogIn()

    await runGraphQLQuery(
      deleteEventCategoryMutation,

      // GraphQL variables:
      { categoryId },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {
        user: { session_id: session.uuid },
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
