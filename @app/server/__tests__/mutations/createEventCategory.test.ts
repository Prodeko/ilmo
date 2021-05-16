import {
  asRoot,
  createEventDataAndLogin,
  deleteTestData,
  runGraphQLQuery,
  sanitize,
  setup,
  teardown,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

const createEventCategoryMutation = `
mutation CreateEventCategory($input: CreateEventCategoryInput!) {
  createEventCategory(input: $input) {
    eventCategory {
      id
      name
      description
      createdBy
      updatedBy
      createdAt
      updatedAt
    }
  }
}`

describe("CreateEventCategory", () => {
  it("can create an event category", async () => {
    const { organization, session } = await createEventDataAndLogin()
    const ownerOrganizationId = organization.id

    await runGraphQLQuery(
      createEventCategoryMutation,

      // GraphQL variables:
      {
        input: {
          eventCategory: {
            ownerOrganizationId,
            name: { fi: "Testikategoria", en: "Test category" },
            description: { fi: "Testikuvaus", en: "Test description" },
          },
        },
      },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {
        user: { session_id: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const category = json.data!.createEventCategory.eventCategory

        expect(category).toBeTruthy()
        expect(sanitize(category)).toMatchInlineSnapshot(`
          Object {
            "createdAt": "[timestamp-1]",
            "createdBy": "[id-2]",
            "description": Object {
              "en": "Test description",
              "fi": "Testikuvaus",
            },
            "id": "[id-1]",
            "name": Object {
              "en": "Test category",
              "fi": "Testikategoria",
            },
            "updatedAt": "[timestamp-1]",
            "updatedBy": "[id-3]",
          }
        `)

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.event_categories WHERE id = $1`,
            [category.id]
          )
        )

        if (rows.length === 0) {
          throw new Error("Event category not found!")
        }
        expect(rows[0].id).toEqual(category.id)
      }
    )
  })

  it("can't create an event category while logged out", async () => {
    const { organization } = await createEventDataAndLogin()
    const ownerOrganizationId = organization.id

    await runGraphQLQuery(
      createEventCategoryMutation,

      // GraphQL variables:
      {
        input: {
          eventCategory: {
            ownerOrganizationId,
            name: "Testikategoria",
            description: "Testikategoria",
          },
        },
      },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
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
