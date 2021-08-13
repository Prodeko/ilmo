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
    label: "Test question, choose option",
    isRequired: false,
    data: ["Radio 1", "Radio 2", "Radio 3"],
  },
  {
    position: 0,
    type: "CHECKBOX",
    label: "Test question, choose option",
    isRequired: true,
    data: ["Check 1", "Check 2", "Check 3"],
  },
  {
    position: 0,
    type: "TEXT",
    label: "Test question, please answer",
    isRequired: true,
    data: null,
  },
]

describe("CreateEvent", () => {
  it("can create eveant while logged in", async () => {
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
            description: { fi: "Testikuvaus", en: "Test description" },
            location: "Testikatu 123",
            ownerOrganizationId: organization.id,
            categoryId: eventCategory.id,
            isHighlighted: true,
            isDraft: false,
            eventStartTime: day.add(1, "days").toISOString(),
            eventEndTime: day.add(2, "days").toISOString(),
            registrationStartTime: day.toISOString(),
            registrationEndTime: day.add(7, "hour").toISOString(),
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

  it("can't create an event while logged out", async () => {
    const { organization, eventCategory } = await createEventDataAndLogin()
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
            description: { fi: "Testikuvaus", en: "Test description" },
            location: "Testikatu 123",
            ownerOrganizationId: organization.id,
            categoryId: eventCategory.id,
            isHighlighted: true,
            isDraft: false,
            eventStartTime: day.add(1, "days").toISOString(),
            eventEndTime: day.add(2, "days").toISOString(),
            registrationStartTime: day.toISOString(),
            registrationEndTime: day.add(7, "hour").toISOString(),
          },
          quotas,
          questions,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        expect(message).toEqual("You must log in to create a event")
      }
    )
  })

  it("must specify at least one event quota", async () => {
    const { session, organization, eventCategory } =
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
            description: { fi: "Testikuvaus", en: "Test description" },
            location: "Testikatu 123",
            ownerOrganizationId: organization.id,
            categoryId: eventCategory.id,
            isHighlighted: true,
            isDraft: false,
            eventStartTime: day.add(1, "days").toISOString(),
            eventEndTime: day.add(2, "days").toISOString(),
            registrationStartTime: day.toISOString(),
            registrationEndTime: day.add(7, "hour").toISOString(),
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
