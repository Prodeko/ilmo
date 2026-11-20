import { McpEventQuery, QuestionType } from "@app/graphql"

import {
  richTextToPlain,
  validateRegistration,
} from "../../src/mcp/registration"

type McpEvent = NonNullable<McpEventQuery["eventBySlug"]>

const event = {
  signupOpen: true,
  quotas: { nodes: [{ id: "quota-1" }] },
  eventQuestions: {
    nodes: [
      {
        id: "q-text",
        type: QuestionType.Text,
        label: { fi: "Allergiat", en: "Allergies" },
        isRequired: false,
        data: null,
      },
      {
        id: "q-radio",
        type: QuestionType.Radio,
        label: { fi: "Koko", en: "Size" },
        isRequired: true,
        data: [
          { fi: "Pieni", en: "Small" },
          { fi: "Iso", en: "Large" },
        ],
      },
      {
        id: "q-checkbox",
        type: QuestionType.Checkbox,
        label: { fi: "Lähde", en: "Source" },
        isRequired: false,
        data: [
          { fi: "Kaveri", en: "Friend" },
          { fi: "Muu", en: "Other" },
        ],
      },
    ],
  },
} as unknown as McpEvent

const valid = {
  quotaId: "quota-1",
  firstName: "Testi",
  lastName: "Henkilö",
  email: "testi@example.com",
  answers: { "q-radio": "Iso", "q-checkbox": ["Friend", "Muu"] },
}

describe("validateRegistration", () => {
  it("accepts a valid registration with options in either language", () => {
    expect(validateRegistration(event, valid)).toEqual([])
  })

  it("rejects a closed event and a quota of another event", () => {
    expect(
      validateRegistration(
        { ...event, signupOpen: false },
        { ...valid, quotaId: "other" }
      )
    ).toEqual([
      "Registration for this event is not open.",
      "quotaId is not one of this event's quotas.",
    ])
  })

  it("rejects names with spaces and missing names", () => {
    expect(
      validateRegistration(event, {
        ...valid,
        firstName: "Anna Maria",
        lastName: "",
      })
    ).toEqual(["firstName must not contain spaces.", "lastName is required."])
  })

  it("requires required questions and known question ids", () => {
    expect(
      validateRegistration(event, { ...valid, answers: { unknown: "x" } })
    ).toEqual([
      "Answer unknown does not match a question of this event.",
      '"Size" is required.',
    ])
  })

  it("rejects answers that are not options or have the wrong shape", () => {
    expect(
      validateRegistration(event, {
        ...valid,
        answers: {
          "q-text": ["not", "a", "string"],
          "q-radio": "Medium",
          "q-checkbox": "Friend",
        },
      })
    ).toEqual([
      '"Allergies" expects a string.',
      '"Size" expects exactly one of: Pieni, Small, Iso, Large.',
      '"Source" expects a list of options from: Kaveri, Friend, Muu, Other.',
    ])
  })
})

describe("richTextToPlain", () => {
  it("joins paragraphs and nested leaves", () => {
    expect(
      richTextToPlain([
        {
          type: "paragraph",
          children: [{ text: "Hello " }, { text: "world" }],
        },
        { type: "paragraph", children: [{ text: "" }] },
        {
          type: "bulleted-list",
          children: [{ type: "list-item", children: [{ text: "Item" }] }],
        },
      ])
    ).toEqual("Hello world\n\nItem")
  })

  it("returns an empty string for missing content", () => {
    expect(richTextToPlain(undefined)).toEqual("")
  })
})
