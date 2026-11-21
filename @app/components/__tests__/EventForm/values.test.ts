import dayjs from "dayjs"

import { toEventInput, toFormValues } from "../../src/EventForm/values"

import type { UpdateEventPageQuery } from "@app/graphql"

const event = {
  __typename: "Event",
  id: "event-1",
  name: { fi: "Vuosijuhla", en: "Annual gala" },
  slug: "2030-5-1-vuosijuhla",
  description: { fi: [], en: [] },
  location: "Otaniemi",
  eventStartTime: "2030-05-01T15:00:00.000Z",
  eventEndTime: "2030-05-01T22:00:00.000Z",
  registrationStartTime: "2030-04-01T09:00:00.000Z",
  registrationEndTime: "2030-04-20T20:59:59.000Z",
  isHighlighted: true,
  highlightText: { fi: "Pian täynnä", en: "Filling up" },
  isDraft: false,
  headerImageFile: "https://example.com/header.png",
  openQuotaSize: 5,
  createdAt: "2030-01-01T00:00:00.000Z",
  category: { __typename: "EventCategory", id: "category-1", name: {} },
  ownerOrganization: { __typename: "Organization", id: "org-1", name: "Org" },
  quotas: {
    nodes: [
      {
        __typename: "Quota",
        id: "quota-1",
        position: 0,
        title: { fi: "Kiintiö", en: "Quota" },
        size: 10,
        registrations: { totalCount: 2 },
      },
    ],
  },
  eventQuestions: {
    nodes: [
      {
        __typename: "EventQuestion",
        id: "question-1",
        position: 0,
        type: "TEXT",
        label: { fi: "Kysymys", en: "Question" },
        isRequired: true,
        data: null,
        prefill: "TELEGRAM",
      },
    ],
  },
} as unknown as UpdateEventPageQuery["event"]

describe("toFormValues", () => {
  it("maps an event to the update form's values", () => {
    const values = toFormValues(event)

    expect(values.languages).toEqual(["fi", "en"])
    expect(values.ownerOrganizationId).toBe("org-1")
    expect(values.categoryId).toBe("category-1")
    expect(values.slug).toBe("2030-5-1-vuosijuhla")
    expect(values.openQuotaSize).toBe(5)
    expect(values.highlightText).toEqual({
      fi: "Pian täynnä",
      en: "Filling up",
    })
    expect(values.eventTime.map((d) => d.toISOString())).toEqual([
      "2030-05-01T15:00:00.000Z",
      "2030-05-01T22:00:00.000Z",
    ])
    expect(values.registrationTime.map((d) => d.toISOString())).toEqual([
      "2030-04-01T09:00:00.000Z",
      "2030-04-20T20:59:59.000Z",
    ])
    expect(values.quotas).toEqual([
      {
        id: "quota-1",
        position: 0,
        title: { fi: "Kiintiö", en: "Quota" },
        size: 10,
        registrations: { totalCount: 2 },
      },
    ])
    expect(values.questions).toEqual([
      {
        id: "question-1",
        position: 0,
        type: "TEXT",
        label: { fi: "Kysymys", en: "Question" },
        isRequired: true,
        data: null,
        prefill: "TELEGRAM",
      },
    ])
    expect(values).not.toHaveProperty("id")
    expect(values).not.toHaveProperty("createdAt")
  })

  it("edits quota prices in euros", () => {
    const values = toFormValues({
      ...event,
      quotas: {
        nodes: [{ ...event!.quotas.nodes[0], priceCents: 1850 }],
      },
    } as unknown as UpdateEventPageQuery["event"])

    expect(values.quotas?.[0]).toMatchObject({ priceCents: 1850, price: 18.5 })
  })

  it("gives empty values while the event is loading", () => {
    const values = toFormValues(undefined)

    expect(values.languages).toEqual([])
    expect(values.quotas).toBeUndefined()
    expect(values.questions).toBeUndefined()
  })
})

describe("toEventInput", () => {
  const formValues = {
    name: { fi: "Vuosijuhla", en: "Annual gala" },
    description: { fi: [], en: [] },
    location: "Otaniemi",
    ownerOrganizationId: "org-1",
    categoryId: "category-1",
    isHighlighted: false,
    isDraft: true,
    languages: ["fi", "en"],
    openQuotaSize: 0,
    eventTime: [
      dayjs("2030-05-01T15:00:00.000Z"),
      dayjs("2030-05-01T22:00:00.000Z"),
    ],
    registrationTime: [
      dayjs("2030-04-01T09:00:00.000Z"),
      dayjs("2030-04-20T20:59:59.000Z"),
    ],
    quotas: [
      { id: "quota-2", position: 1, title: { fi: "B" }, size: 3 },
      { title: { fi: "A" }, size: 4, templateKey: "members" },
    ],
    questions: [{ type: "TEXT", label: { fi: "Kysymys" }, data: null }],
  } as any

  it("maps the form's values to the mutation input", () => {
    expect(toEventInput(formValues)).toEqual({
      event: {
        ownerOrganizationId: "org-1",
        categoryId: "category-1",
        name: { fi: "Vuosijuhla", en: "Annual gala" },
        description: { fi: [], en: [] },
        location: "Otaniemi",
        isHighlighted: false,
        isDraft: true,
        slug: "2030-5-1-vuosijuhla",
        highlightText: null,
        eventStartTime: "2030-05-01T15:00:00.000Z",
        eventEndTime: "2030-05-01T22:00:00.000Z",
        registrationStartTime: "2030-04-01T09:00:00.000Z",
        registrationEndTime: "2030-04-20T20:59:59.000Z",
        headerImageFile: undefined,
        openQuotaSize: 0,
      },
      // Positions follow the list order and form-only keys are dropped
      quotas: [
        { id: "quota-2", position: 0, title: { fi: "B" }, size: 3 },
        { position: 1, title: { fi: "A" }, size: 4 },
      ],
      questions: [
        {
          position: 0,
          type: "TEXT",
          label: { fi: "Kysymys" },
          isRequired: false,
          data: null,
          prefill: "NONE",
        },
      ],
    })
  })

  it("does not change the form's values", () => {
    const before = JSON.stringify(formValues)
    toEventInput(formValues)
    expect(JSON.stringify(formValues)).toBe(before)
  })

  it("uploads only a newly chosen header image", () => {
    const file = { name: "header.png" }
    expect(
      toEventInput({
        ...formValues,
        headerImageFile: { uid: "1", name: "header.png", originFileObj: file },
      }).event.headerImageFile
    ).toBe(file)
    expect(
      toEventInput({ ...formValues, headerImageFile: "https://example.com/a" })
        .event.headerImageFile
    ).toBeUndefined()
  })

  it("saves trimmed ribbon texts in the selected languages", () => {
    expect(
      toEventInput({
        ...formValues,
        isHighlighted: true,
        languages: ["fi"],
        highlightText: { fi: " Pian täynnä ", en: "Filling up" },
      }).event.highlightText
    ).toEqual({ fi: "Pian täynnä" })
  })

  it("clears the ribbon text when it is empty or the event is not highlighted", () => {
    expect(
      toEventInput({
        ...formValues,
        isHighlighted: true,
        highlightText: { fi: " ", en: "" },
      }).event.highlightText
    ).toBeNull()
    expect(
      toEventInput({
        ...formValues,
        isHighlighted: false,
        highlightText: { fi: "Pian täynnä" },
      }).event.highlightText
    ).toBeNull()
  })

  describe("quota prices", () => {
    const paidValues = {
      ...formValues,
      quotas: [
        { id: "quota-2", title: { fi: "B" }, size: 3, price: 18.5 },
        { title: { fi: "A" }, size: 4, price: null },
        { title: { fi: "C" }, size: 5 },
      ],
    } as any

    it("leaves them out while payments are off", () => {
      const input = toEventInput(paidValues)

      input.quotas.forEach((quota) =>
        expect(quota).not.toHaveProperty("priceCents")
      )
    })

    it("sends them in cents while payments are on", () => {
      const input = toEventInput(paidValues, { payments: true })

      // A cleared price is free; a quota without a price input keeps its
      // stored price (or is free when new)
      expect(input.quotas.map((q) => q.priceCents)).toEqual([
        1850,
        0,
        undefined,
      ])
      expect(input.quotas[2]).not.toHaveProperty("priceCents")
    })
  })

  it("sends a question without a prefill as NONE, which clears it", () => {
    const values = toFormValues(event) as any
    const input = toEventInput({
      ...values,
      questions: [
        { ...values.questions[0], prefill: null },
        { ...values.questions[0], id: undefined, prefill: undefined },
      ],
    })
    expect(input.questions?.map((q) => q.prefill)).toEqual(["NONE", "NONE"])
  })

  it("sends an empty quota list when the form has no quotas", () => {
    expect(toEventInput({ ...formValues, quotas: undefined }).quotas).toEqual(
      []
    )
  })

  it("saves an unchanged event as it was loaded", () => {
    const input = toEventInput(toFormValues(event) as any)

    expect(input.event).toMatchObject({
      ownerOrganizationId: "org-1",
      categoryId: "category-1",
      name: { fi: "Vuosijuhla", en: "Annual gala" },
      location: "Otaniemi",
      isHighlighted: true,
      highlightText: { fi: "Pian täynnä", en: "Filling up" },
      isDraft: false,
      slug: "2030-5-1-vuosijuhla",
      eventStartTime: "2030-05-01T15:00:00.000Z",
      eventEndTime: "2030-05-01T22:00:00.000Z",
      registrationStartTime: "2030-04-01T09:00:00.000Z",
      registrationEndTime: "2030-04-20T20:59:59.000Z",
      openQuotaSize: 5,
      headerImageFile: undefined,
    })
    expect(input.quotas).toEqual([
      {
        id: "quota-1",
        position: 0,
        title: { fi: "Kiintiö", en: "Quota" },
        size: 10,
      },
    ])
    expect(input.questions).toEqual([
      {
        id: "question-1",
        position: 0,
        type: "TEXT",
        label: { fi: "Kysymys", en: "Question" },
        isRequired: true,
        data: null,
        prefill: "TELEGRAM",
      },
    ])
  })
})
