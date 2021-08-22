import { asRoot } from "../../../__tests__/helpers"
import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

const registerMutations = `
mutation Register($username: String!, $password: String!, $name: String!, $email: String!) {
  register(
    input: {
      username: $username
      password: $password
      name: $name
      email: $email
    }
  ) {
    user {
      id
      name
      avatarUrl
      isAdmin
      isVerified
      username
      createdAt
      updatedAt
    }
  }
}`

// If process.env.ENABLE_REGISTRATION=1, remove skip
test.skip("Register", async () => {
  await runGraphQLQuery(
    registerMutations,

    // GraphQL variables:
    {
      username: "testuser",
      password: "SECURE_PASSWORD",
      name: "Test User",
      email: "testuser@example.org",
    },

    // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
    {
      login: jest.fn((_user, cb) => process.nextTick(cb)),
    },

    // This function runs all your test assertions:
    async (json, { pgClient }) => {
      expect(json.errors).toBeFalsy()
      expect(json.data).toBeTruthy()

      const id = json.data!.register.user.id

      // If you need to, you can query the DB within the context of this
      // function - e.g. to check that your mutation made the changes you'd
      // expect.
      const { rows } = await asRoot(pgClient, () =>
        pgClient.query(`SELECT * FROM app_public.users WHERE id = $1`, [id])
      )
      if (rows.length !== 1) {
        throw new Error("User not found!")
      }
      expect(rows[0].username).toEqual(json.data!.register.user.username)
    }
  )
})
