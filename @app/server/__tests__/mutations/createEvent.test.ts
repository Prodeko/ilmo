import { CreateEventDocument } from "@app/graphql"
import dayjs from "dayjs"
import slugify from "slugify"

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

const quotas = [
  {
    position: 0,
    title: {
      fi: "Kiintiö 1",
      en: "Quota 1",
    },
    size: 1,
  },
  {
    position: 1,
    title: {
      fi: "Kiintiö 2",
      en: "Quota 2",
    },
    size: 2,
  },
  {
    position: 2,
    title: {
      fi: "Kiintiö 3",
      en: "Quota 3",
    },
    size: 3,
  },
]

const questions = [
  {
    position: 0,
    type: "RADIO",
    label: {
      en: "Test question, choose option",
      fi: "Testikysymys, valitse vaihtoehto",
    },
    isRequired: false,
    data: [
      { fi: "Radio 1", en: "Radio 1" },
      { fi: "Radio 2", en: "Radio 2" },
      { fi: "Radio 3", en: "Radio 3" },
    ],
  },
  {
    position: 0,
    type: "CHECKBOX",
    label: {
      en: "Test question, choose option",
      fi: "Testikysymys, valitse vaihtoehto",
    },
    isRequired: true,
    data: [
      { fi: "Check 1", en: "Check 1" },
      { fi: "Check 2", en: "Check 2" },
      { fi: "Check 3", en: "Check 3" },
    ],
  },
  {
    position: 0,
    type: "TEXT",
    label: {
      en: "Test question",
      fi: "Testikysymys",
    },
    isRequired: true,
    data: null,
  },
]

describe("CreateEvent", () => {
  it("can create event while logged in", async () => {
    const { organization, eventCategory, session } =
      await createEventDataAndLogin({
        userOptions: { create: true, isAdmin: true },
      })
    const day = dayjs("2021-02-20")
    const daySlug = day.format("YYYY-M-D")
    const slug = slugify(`${daySlug}-testitapahtuma`, {
      lower: true,
    })

    await runGraphQLQuery(
      CreateEventDocument,

      // GraphQL variables:
      {
        input: {
          event: {
            slug: slug,
            name: { fi: "Testitapahtuma", en: "Test event" },
            description: {
              fi: [{ type: "paragraph", children: [{ text: "Testikuvaus" }] }],
              en: [
                { type: "paragraph", children: [{ text: "Test description" }] },
              ],
            },
            location: "Testikatu 123",
            ownerOrganizationId: organization.id,
            categoryId: eventCategory.id,
            isHighlighted: true,
            isDraft: false,
            eventStartTime: day.add(1, "days").toISOString(),
            eventEndTime: day.add(2, "days").toISOString(),
            registrationStartTime: day.toISOString(),
            registrationEndTime: day.add(7, "hour").toISOString(),
            openQuotaSize: 0,
          },
          quotas,
          questions,
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

        const event = json.data!.createEvent.event

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
        if (quotaRows.length !== 3) {
          throw new Error("Wrong amount of quotas after mutation!")
        }
        if (questionRows.length !== 3) {
          throw new Error("Wrong amount of questions after mutation!")
        }
      }
    )
  })

  it("can't create an event if not an admin", async () => {
    const { organization, eventCategory, session } =
      await createEventDataAndLogin()
    const day = dayjs("2021-02-20")
    const daySlug = day.format("YYYY-M-D")
    const slug = slugify(`${daySlug}-testitapahtuma`, {
      lower: true,
    })

    await runGraphQLQuery(
      CreateEventDocument,
      // GraphQL variables:
      {
        input: {
          event: {
            slug: slug,
            name: { fi: "Testitapahtuma", en: "Test event" },
            description: {
              fi: [{ type: "paragraph", children: [{ text: "Testikuvaus" }] }],
              en: [
                { type: "paragraph", children: [{ text: "Test description" }] },
              ],
            },
            location: "Testikatu 123",
            ownerOrganizationId: organization.id,
            categoryId: eventCategory.id,
            isHighlighted: true,
            isDraft: false,
            eventStartTime: day.add(1, "days").toISOString(),
            eventEndTime: day.add(2, "days").toISOString(),
            registrationStartTime: day.toISOString(),
            registrationEndTime: day.add(7, "hour").toISOString(),
            openQuotaSize: 0,
          },
          quotas,
          questions,
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

        expect(message).toEqual(
          "Acces denied. Only admins are allowed to use this mutation."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("must specify at least one event quota", async () => {
    const { session, organization, eventCategory } =
      await createEventDataAndLogin({
        userOptions: { create: true, isAdmin: true },
      })
    const day = dayjs("2021-02-20")
    const daySlug = day.format("YYYY-M-D")
    const slug = slugify(`${daySlug}-testitapahtuma`, {
      lower: true,
    })

    await runGraphQLQuery(
      CreateEventDocument,
      // GraphQL variables:
      {
        input: {
          event: {
            slug: slug,
            name: { fi: "Testitapahtuma", en: "Test event" },
            description: {
              fi: [{ type: "paragraph", children: [{ text: "Testikuvaus" }] }],
              en: [
                { type: "paragraph", children: [{ text: "Test description" }] },
              ],
            },
            location: "Testikatu 123",
            ownerOrganizationId: organization.id,
            categoryId: eventCategory.id,
            isHighlighted: true,
            isDraft: false,
            eventStartTime: day.add(1, "days").toISOString(),
            eventEndTime: day.add(2, "days").toISOString(),
            registrationStartTime: day.toISOString(),
            registrationEndTime: day.add(7, "hour").toISOString(),
            openQuotaSize: 0,
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
})
