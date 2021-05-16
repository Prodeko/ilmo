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

describe("UpdateEventCategory", () => {
  it("can update an existing event", async () => {
    const { organization, eventCategory, session } =
      await createEventDataAndLogin()
    const categoryId = eventCategory.id

    await runGraphQLQuery(
      `mutation UpdateEventCategory(
        $categoryId: UUID!
        $patch: EventCategoryPatch!
      ) {
        updateEventCategory(
          input: {
            id: $categoryId
            patch: $patch
          }
        ) {
          eventCategory {
            id
            name
            description
            ownerOrganizationId
            createdBy
            updatedBy
            createdAt
            updatedAt
          }
        }
      }`,

      // GraphQL variables:
      {
        categoryId,
        patch: {
          name: {
            fi: "Päivitetty testikategoria",
            en: "Updated test event category",
          },
          description: {
            fi: "Päivitetty testikuvaus",
            en: "Updated test description",
          },
          ownerOrganizationId: organization.id,
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

        const updatedEventCategory =
          json.data!.updateEventCategory.eventCategory

        expect(updatedEventCategory).toBeTruthy()
        expect(updatedEventCategory.ownerOrganizationId).toEqual(
          organization.id
        )

        expect(sanitize(updatedEventCategory)).toMatchInlineSnapshot(`
          Object {
            "createdAt": "[timestamp-1]",
            "createdBy": "[id-3]",
            "description": Object {
              "en": "Updated test description",
              "fi": "Päivitetty testikuvaus",
            },
            "id": "[id-1]",
            "name": Object {
              "en": "Updated test event category",
              "fi": "Päivitetty testikategoria",
            },
            "ownerOrganizationId": "[id-2]",
            "updatedAt": "[timestamp-2]",
            "updatedBy": "[id-3]",
          }
        `)

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.event_categories WHERE id = $1`,
            [updatedEventCategory.id]
          )
        )

        if (rows.length !== 1) {
          throw new Error("Event category not found!")
        }
        expect(rows[0].id).toEqual(updatedEventCategory.id)
        expect(rows[0].name.fi).toEqual("Päivitetty testikategoria")
      }
    )
  })

  it("can't update an event while logged out (RLS policy)", async () => {
    const { events } = await createEventDataAndLogin({
      registrationOptions: { create: false },
    })
    const categoryId = events[0].id

    await runGraphQLQuery(
      `mutation UpdateEventCategory(
        $categoryId: UUID!
        $description: JSON!
      ) {
        updateEventCategory(
          input: {
            id: $categoryId
            patch: {
              description: $description
            }
          }
        ) {
          eventCategory {
            id
          }
        }
      }`,

      // GraphQL variables:
      {
        categoryId,
        description: { fi: "Testi", en: "Test" },
      },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        expect(message).toEqual(
          "No values were updated in collection 'event_categories' because no values you can update were found matching these criteria."
        )
      }
    )
  })
})
