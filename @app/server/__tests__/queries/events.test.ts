import {
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

const eventsQuery = `
{
  events {
    nodes {
      id
    }
  }
}`

test("events when logged out (RLS policy)", async () => {
  await createEventDataAndLogin({
    eventOptions: { create: true, amount: 5, isDraft: true },
  })

  await runGraphQLQuery(
    // GraphQL query goes here:
    eventsQuery,

    // GraphQL variables:
    {},

    // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
    {},

    // This function runs all your test assertions:
    async (json) => {
      expect(json.errors).toBeFalsy()
      expect(json.data).toBeTruthy()
      expect(json.data!.events.nodes).toHaveLength(0)
    }
  )
})

test("events when logged in, NOT admin and NOT member of the owner organization (RLS policy)", async () => {
  await createEventDataAndLogin({
    eventOptions: { create: true, amount: 5, isDraft: true },
  })

  // Different user and session than the one who created the events.
  // The user is NOT admin so draft events should NOT be visible to them.
  const { session } = await createUserAndLogIn()

  await runGraphQLQuery(
    // GraphQL query goes here:
    eventsQuery,

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
      expect(json.data!.events.nodes).toHaveLength(0)
    }
  )
})

test("events when logged in, NOT admin and IS member of the owner organization (RLS policy)", async () => {
  const { session } = await createEventDataAndLogin({
    eventOptions: { create: true, amount: 5, isDraft: true },
  })

  await runGraphQLQuery(
    // GraphQL query goes here:
    eventsQuery,

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
      expect(json.data!.events.nodes).toHaveLength(5)
    }
  )
})

test("events when logged in, IS admin, NOT a member of the owner organization (RLS policy)", async () => {
  await createEventDataAndLogin({
    eventOptions: { create: true, amount: 5, isDraft: true },
  })

  // Different user and session than the one who created the events.
  // The user is admin so draft events should be visible to them.
  const { session } = await createUserAndLogIn({ isAdmin: true })

  await runGraphQLQuery(
    // GraphQL query goes here:
    eventsQuery,

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
      expect(json.data!.events.nodes).toHaveLength(5)
    }
  )
})
