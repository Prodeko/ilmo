import { CreateEventCategoryDocument } from "@app/graphql"

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

describe("CreateEventCategory", () => {
  it("can create an event category when logged in", async () => {
    const { organization, session } = await createEventDataAndLogin()
    const ownerOrganizationId = organization.id

    await runGraphQLQuery(
      CreateEventCategoryDocument,

      // GraphQL variables:
      {
        input: {
          eventCategory: {
            ownerOrganizationId,
            name: { fi: "Testikategoria", en: "Test category" },
            description: { fi: "Testikuvaus", en: "Test description" },
            color: "#002e7d",
          },
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const category = json.data!.createEventCategory.eventCategory

        expect(category).toBeTruthy()

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.event_categories WHERE id = $1`,
            [category.id]
          )
        )

        if (rows.length === 0) {
          throw new Error("Event category not found!")
        }
      }
    )
  })

  it("can't create an event category while logged out", async () => {
    const { organization } = await createEventDataAndLogin()
    const ownerOrganizationId = organization.id

    await runGraphQLQuery(
      CreateEventCategoryDocument,

      // GraphQL variables:
      {
        input: {
          eventCategory: {
            ownerOrganizationId,
            name: { fi: "Testikategoria", en: "Test category" },
            description: { fi: "Testikuvaus", en: "Test description" },
            color: "#002e7d",
          },
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        expect(message).toEqual("Permission denied (by RLS)")
      }
    )
  })
})
