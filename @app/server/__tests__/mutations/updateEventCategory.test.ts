import { UpdateEventCategoryDocument } from "../../../graphql"
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

describe("UpdateEventCategory", () => {
  it("can update an existing event category", async () => {
    const { organization, eventCategory, session } =
      await createEventDataAndLogin()

    await runGraphQLQuery(
      UpdateEventCategoryDocument,

      // GraphQL variables:
      {
        input: {
          id: eventCategory.id,
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
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const updatedEventCategory =
          json.data!.updateEventCategory.eventCategory

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

  it("can't update an event category while logged out (RLS policy)", async () => {
    const { eventCategory } = await createEventDataAndLogin({
      registrationOptions: { create: false },
    })
    await runGraphQLQuery(
      UpdateEventCategoryDocument,

      // GraphQL variables:
      {
        input: {
          id: eventCategory.id,
          patch: {
            description: {
              fi: "Päivitetty testikuvaus",
              en: "Updated test description",
            },
          },
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
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
