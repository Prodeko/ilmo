import { CreateOrganizationDocument } from "@app/graphql"

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

describe("CreateOrganization", () => {
  it("can create an organization when logged in as admin", async () => {
    const { session } = await createEventDataAndLogin({
      userOptions: { create: true, isAdmin: true },
    })

    await runGraphQLQuery(
      CreateOrganizationDocument,

      // GraphQL variables:
      {
        name: "Test organization",
        slug: "test-organization",
        color: "#ffffff",
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const organization = json.data!.createOrganization.organization

        expect(organization).toBeTruthy()

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.organizations WHERE id = $1`,
            [organization.id]
          )
        )

        if (rows.length === 0) {
          throw new Error("Organization not found!")
        }
      }
    )
  })

  it("can create an organization when logged in as non admin", async () => {
    const { session } = await createEventDataAndLogin({
      userOptions: { create: true, isAdmin: false },
    })

    await runGraphQLQuery(
      CreateOrganizationDocument,

      // GraphQL variables:
      {
        name: "Test organization",
        slug: "test-organization",
        color: "#ffffff",
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        expect(message).toEqual(
          "Acces denied. Only admins are allowed to use this mutation."
        )
      }
    )
  })
})
