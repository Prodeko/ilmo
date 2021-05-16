import {
  asRoot,
  createEventDataAndLogin,
  createSession,
  createUsers,
  deleteTestData,
  poolFromUrl,
  runGraphQLQuery,
  setup,
  teardown,
  TEST_DATABASE_URL,
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
  it("admin can delete an event category", async () => {
    const { eventCategory, session } = await createEventDataAndLogin({
      eventOptions: { create: false },
      quotaOptions: { create: false },
      registrationOptions: { create: false },
      registrationSecretOptions: { create: false },
      userOptions: { create: true, isAdmin: true },
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

  it("users without the right permissions cannot delete events", async () => {
    const { eventCategory } = await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: true },
    })
    const categoryId = eventCategory.id

    const pool = poolFromUrl(TEST_DATABASE_URL)
    const client = await pool.connect()
    const users = await createUsers(
      client,
      1,
      true, // isVerified
      false // isAdmin
    )
    const secondaryUser = users[0]
    const secondarySession = await createSession(client, secondaryUser.id)
    await client.release()

    await runGraphQLQuery(
      deleteEventCategoryMutation,

      // GraphQL variables:
      { categoryId },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {
        user: { session_id: secondarySession.uuid },
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
