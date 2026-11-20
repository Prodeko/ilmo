import { McpEventOptionsQuery, QuestionType } from "@app/graphql"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { tokenGrantsAdmin } from "../../src/mcp/auth"
import {
  createEventInput,
  eventSlug,
  NewEvent,
  plainToRichText,
  validateNewEvent,
} from "../../src/mcp/events"
import { createMcpServer, GraphQLRunner } from "../../src/mcp/server"

const options = {
  organizations: { nodes: [{ id: "org-1", name: "PoRa" }] },
  eventCategories: {
    nodes: [
      {
        id: "cat-1",
        name: { fi: "Liikunta" },
        ownerOrganization: { id: "org-1" },
      },
      { id: "cat-2", name: { fi: "Muu" }, ownerOrganization: { id: "org-2" } },
    ],
  },
} as McpEventOptionsQuery

const valid: NewEvent = {
  organizationId: "org-1",
  categoryId: "cat-1",
  name: { fi: "Testitapahtuma", en: "Test event" },
  description: { fi: "Ensimmäinen.\n\nToinen\nrivi." },
  location: "Otaniemi",
  eventStartTime: "2026-12-01T23:30:00+02:00",
  eventEndTime: "2026-12-02T02:00:00+02:00",
  registrationStartTime: "2026-11-01T12:00:00+02:00",
  registrationEndTime: "2026-11-30T12:00:00+02:00",
  openQuotaSize: 0,
  isHighlighted: false,
  quotas: [{ title: { fi: "Kaikki" }, size: 10 }],
  questions: [
    { type: QuestionType.Text, label: { fi: "Allergiat" }, required: false },
    {
      type: QuestionType.Radio,
      label: { fi: "Koko" },
      required: true,
      options: [{ fi: "S" }, { fi: "M", en: "M" }],
    },
  ],
}

describe("validateNewEvent", () => {
  it("accepts a valid event", () => {
    expect(validateNewEvent(valid, options)).toEqual([])
  })

  it("rejects a category of another organization and unknown ids", () => {
    expect(
      validateNewEvent({ ...valid, categoryId: "cat-2" }, options)
    ).toEqual(["The category belongs to another organization."])
    expect(
      validateNewEvent(
        { ...valid, organizationId: "nope", categoryId: "nope" },
        options
      )
    ).toEqual([
      "organizationId is not an organization.",
      "categoryId is not an event category.",
    ])
  })

  it("rejects inconsistent times, missing quotas and option mismatches", () => {
    expect(
      validateNewEvent(
        {
          ...valid,
          description: { fi: "  " },
          eventEndTime: valid.eventStartTime,
          registrationEndTime: valid.eventStartTime,
          quotas: [],
          questions: [
            {
              type: QuestionType.Text,
              label: { fi: "a" },
              required: false,
              options: [{ fi: "x" }],
            },
            {
              type: QuestionType.Checkbox,
              label: { fi: "b" },
              required: false,
            },
          ],
        },
        options
      )
    ).toEqual([
      "A description in Finnish or English is required.",
      "The event must end after it starts.",
      "Registration must close before the event starts.",
      "Give at least one quota or an open quota size above zero.",
      "Question 1: TEXT questions take no options.",
      "Question 2: CHECKBOX questions need options.",
    ])
  })
})

describe("createEventInput", () => {
  it("always creates a draft and maps quotas, questions and texts", () => {
    const input = createEventInput(valid)
    expect(input.event).toMatchObject({
      isDraft: true,
      slug: "2026-12-1-testitapahtuma",
      name: { fi: "Testitapahtuma", en: "Test event" },
      description: {
        fi: [
          { type: "paragraph", children: [{ text: "Ensimmäinen." }] },
          { type: "paragraph", children: [{ text: "Toinen rivi." }] },
        ],
      },
      ownerOrganizationId: "org-1",
      categoryId: "cat-1",
    })
    expect(input.quotas).toEqual([
      { position: 0, title: { fi: "Kaikki" }, size: 10 },
    ])
    expect(input.questions).toEqual([
      {
        position: 0,
        type: "TEXT",
        label: { fi: "Allergiat" },
        isRequired: false,
        data: null,
      },
      {
        position: 1,
        type: "RADIO",
        label: { fi: "Koko" },
        isRequired: true,
        data: [{ fi: "S" }, { fi: "M", en: "M" }],
      },
    ])
  })
})

describe("eventSlug", () => {
  it("uses the start date in Finnish time", () => {
    // 22:30 UTC on Nov 30 is already Dec 1 in Helsinki
    expect(eventSlug({ fi: "Pikkujoulut" }, "2026-11-30T22:30:00Z")).toBe(
      "2026-12-1-pikkujoulut"
    )
  })
})

describe("plainToRichText", () => {
  it("drops empty paragraphs", () => {
    expect(plainToRichText("\n\nYksi\n\n\n\n")).toEqual([
      { type: "paragraph", children: [{ text: "Yksi" }] },
    ])
  })
})

describe("admin tools", () => {
  it("are granted only by the ilmo-admin realm role in the token", () => {
    expect(tokenGrantsAdmin({ realm_access: { roles: ["ilmo-admin"] } })).toBe(
      true
    )
    expect(
      tokenGrantsAdmin({ realm_access: { roles: ["offline_access"] } })
    ).toBe(false)
    expect(tokenGrantsAdmin({})).toBe(false)
  })

  it.each([
    [false, ["list_events", "get_event", "register_to_event"]],
    [
      true,
      [
        "list_events",
        "get_event",
        "register_to_event",
        "list_event_options",
        "create_event",
      ],
    ],
  ])("are listed only for admins (isAdmin: %s)", async (isAdmin, expected) => {
    const runner: GraphQLRunner = {
      transaction: () => Promise.reject(new Error("not used")),
    }
    const server = createMcpServer(runner, { isAdmin })
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair()
    const client = new Client({ name: "test", version: "0" })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      const { tools } = await client.listTools()
      expect(tools.map((t) => t.name)).toEqual(expected)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
