import {
  createEventDataAndLogin,
  deleteTestData,
  runGraphQLQuery,
  setup,
  teardown,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

const registrationsQuery = `
{
  registrations(orderBy: CREATED_AT_DESC) {
    nodes {
      id
      email
    }
  }
}`

describe("Registration email obfuscation", () => {
  test("masks email values when user is logged out", async () => {
    await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: false },
      eventOptions: { create: true, amount: 1, isDraft: true },
      registrationOptions: { create: true, amount: 1 },
    })
    await runGraphQLQuery(
      // GraphQL query goes here:
      registrationsQuery,

      // GraphQL variables:
      {},

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()
        expect(json.data.registrations.nodes[0].email).toEqual("***")
      }
    )
  })

  test("masks email values when user is not an admin", async () => {
    await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: false },
      eventOptions: { create: true, amount: 1, isDraft: true },
      registrationOptions: { create: true, amount: 3 },
    })
    // Create another user who is not an admin. They should not be able to see
    // any registration emails
    const { session: anotherSession } = await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: false },
      eventOptions: { create: false },
      quotaOptions: { create: false },
      questionOptions: { create: false },
      registrationOptions: { create: false },
    })
    await runGraphQLQuery(
      // GraphQL query goes here:
      registrationsQuery,

      // GraphQL variables:
      {},

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: anotherSession.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()
        json.data!.registrations.nodes.forEach((r) => {
          expect(r.email).toEqual("***")
        })
      }
    )
  })

  test("displays email values when user is an admin", async () => {
    await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: false },
      eventOptions: { create: true, amount: 1, isDraft: true },
      registrationOptions: { create: true, amount: 5 },
    })
    // Create another user who is an admin. They should be able to see
    // all registration emails
    const { session: anotherSession } = await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: true },
      eventOptions: { create: false },
      quotaOptions: { create: false },
      questionOptions: { create: false },
      registrationOptions: { create: false },
    })

    await runGraphQLQuery(
      // GraphQL query goes here:
      registrationsQuery,

      // GraphQL variables:
      {},

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: anotherSession.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()
        json.data!.registrations.nodes.forEach((r) => {
          expect(r.email).not.toEqual("***")
        })
      }
    )
  })

  test("displays own registration email address but hides others for a logged in user that is not admin", async () => {
    await createEventDataAndLogin({
      userOptions: { create: true, amount: 1, isAdmin: false },
      eventOptions: { create: true, amount: 1, isDraft: true },
      registrationOptions: { create: true, amount: 2 },
    })
    // Create another user who is not an admin. They should see the email
    // address of their own registration but not others
    const { session: anotherSession, registrations: ownRegistrations } =
      await createEventDataAndLogin({
        userOptions: { create: true, amount: 1, isAdmin: false },
        registrationOptions: { create: true, amount: 1 },
      })
    const ownRegistration = ownRegistrations[0]

    await runGraphQLQuery(
      // GraphQL query goes here:
      registrationsQuery,

      // GraphQL variables:
      {},

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: anotherSession.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()
        json.data!.registrations.nodes.forEach((r) => {
          if (r.id === ownRegistration.id) {
            expect(r.email).toEqual(ownRegistration.email)
          } else {
            expect(r.email).toEqual("***")
          }
        })
      }
    )
  })
})
