import { RegisterDocument } from "@app/graphql"

import { asRoot } from "../../../__tests__/helpers"
import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)
beforeAll(() => {
  process.env.REGISTER_DOMAINS_ALLOWLIST = "prodeko.org"
})

describe("Register", () => {
  test("can register with with an email address that is in REGISTER_DOMAINS_ALLOWLIST", async () => {
    await runGraphQLQuery(
      RegisterDocument,

      // GraphQL variables:
      {
        username: "testuser",
        password: "SECURE_PASSWORD",
        name: "Test User",
        email: "testuser@prodeko.org",
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

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

  test("can't register from an unallowed domain", async () => {
    await runGraphQLQuery(
      RegisterDocument,

      // GraphQL variables:
      {
        username: "testuser",
        password: "SECURE_PASSWORD",
        name: "Test User",
        email: "testuser@example.org",
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual(
          "Registrations from this domain are not allowed"
        )
        expect(code).toEqual("DNIED")
      }
    )
  })
})
