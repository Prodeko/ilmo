import { UpdateEventDocument } from "@app/graphql"
import { pick } from "lodash"

import {
  asRoot,
  camelizeKeys,
  createEventDataAndLogin,
  deleteTestData,
  runGraphQLQuery,
  setup,
  teardown,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

describe("UpdateEvent", () => {
  it("can update an existing event", async () => {
    const { events, quotas, questions, session } =
      await createEventDataAndLogin()
    const event = events[0]

    await runGraphQLQuery(
      UpdateEventDocument,
      // GraphQL variables:
      {
        input: {
          id: event.id,
          event: {
            name: { fi: "Päivitetty testitapahtuma", en: "Updated test event" },
            description: {
              fi: "Päivitetty testikuvaus",
              en: "Updated test description",
            },
          },
          quotas: [
            ...quotas.map((q) =>
              pick(camelizeKeys(q), ["id", "position", "size", "title"])
            ),
            {
              // Should also be able to create new quotas via this mutation if
              // id is not specified
              position: 2,
              size: 2,
              title: {
                fi: "Testikiintiö 3",
                en: "Test quota 3",
              },
            },
          ],
          questions: [
            ...questions.map((q) =>
              pick(camelizeKeys(q), [
                "id",
                "position",
                "type",
                "label",
                "isRequired",
                "data",
              ])
            ),
            {
              // Should also be able to create new questions via this mutation if
              // id is not specified
              position: 0,
              type: "CHECKBOX",
              label: {
                en: "Test question, choose option",
                fi: "Testikysymys, valitse vaihtoehto",
              },
              isRequired: false,
              data: [{ fi: "New 1" }, { fi: "New 2" }, { fi: "New 3" }],
            },
          ],
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

        const updatedEvent = json.data!.updateEvent.event

        const { rows: eventRows } = await asRoot(pgClient, () =>
          pgClient.query(`SELECT * FROM app_public.events WHERE id = $1`, [
            event.id,
          ])
        )
        const { rows: quotaRows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.quotas WHERE event_id = $1`,
            [event.id]
          )
        )
        const { rows: questionRows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.event_questions WHERE event_id = $1`,
            [event.id]
          )
        )

        if (eventRows.length !== 1) {
          throw new Error("Event not found!")
        }
        if (quotaRows.length !== quotas.length + 1) {
          throw new Error("Wrong amount of quotas after mutation!")
        }
        if (questionRows.length !== questions.length + 1) {
          throw new Error("Wrong amount of questions after mutation!")
        }

        expect(eventRows[0].id).toEqual(updatedEvent.id)
        expect(eventRows[0].name.fi).toEqual("Päivitetty testitapahtuma")
      }
    )
  })

  it("must specify at least one event quota", async () => {
    const { events, session } = await createEventDataAndLogin({
      quotaOptions: { create: false },
      registrationOptions: { create: false },
      registrationSecretOptions: { create: false },
    })
    const event = events[0]

    await runGraphQLQuery(
      UpdateEventDocument,
      // GraphQL variables:
      {
        input: {
          id: event.id,
          event: {
            name: { fi: "Päivitetty testitapahtuma", en: "Updated test event" },
            description: {
              fi: "Päivitetty testikuvaus",
              en: "Updated test description",
            },
          },
          quotas: [],
          questions: [],
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {
        user: { sessionId: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code

        expect(message).toEqual("You must specify at least one quota")
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("can't update an event while logged out", async () => {
    const { events, quotas, questions } = await createEventDataAndLogin({
      registrationOptions: { create: false },
    })
    const event = events[0]

    await runGraphQLQuery(
      UpdateEventDocument,

      // GraphQL variables:
      {
        input: {
          id: event.id,
          event: {
            description: {
              fi: "Päivitetty testikuvaus",
              en: "Updated test description",
            },
          },
          quotas: [
            ...quotas.map((q) =>
              pick(camelizeKeys(q), ["id", "position", "size", "title"])
            ),
          ],
          questions: [
            ...questions.map((q) =>
              pick(camelizeKeys(q), [
                "id",
                "position",
                "type",
                "label",
                "isRequired",
                "data",
              ])
            ),
          ],
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        expect(message).toEqual("You must log in to update an event")
      }
    )
  })
})
