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

const currentUserQuery = `
{
  currentUser {
    id
  }
}`

test("currentUser when logged out", async () => {
  await runGraphQLQuery(
    // GraphQL query goes here:
    currentUserQuery,

    // GraphQL variables:
    {},

    // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
    {},

    // This function runs all your test assertions:
    async (json) => {
      expect(json.errors).toBeFalsy()
      expect(json.data).toBeTruthy()
      expect(json.data!.currentUser).toBe(null)
    }
  )
})

test("currentUser when logged in", async () => {
  const { user, session } = await createUserAndLogIn()
  await runGraphQLQuery(
    // GraphQL query goes here:
    currentUserQuery,

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
      expect(json.data!.currentUser).toMatchObject({
        id: user.id,
      })
    }
  )
})
