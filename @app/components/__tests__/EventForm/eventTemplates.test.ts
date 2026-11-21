import dayjs from "dayjs"

import {
  buildPresetQuestions,
  buildPresetQuota,
  buildTemplateQuestions,
  buildTemplateQuotas,
  hasTemplateItems,
  presetKeysOf,
  replaceTemplateItems,
  TemplateItem,
  togglePresets,
  withoutHandPickedPresets,
} from "../../src/EventForm/eventTemplates"
import { toEventInput } from "../../src/EventForm/values"

const languages = ["fi", "en"]

describe("template builders", () => {
  it("builds a quota per year group, without sizes, in the event's languages", () => {
    const quotas = buildTemplateQuotas("yearGroups", ["fi"])
    expect(quotas.map((q) => q.title)).toEqual(
      ["I", "II", "III", "IV", "N"].map((fi) => ({ fi }))
    )
    expect(quotas.every((q) => q.templateKey === "yearGroups")).toBe(true)
    expect(quotas.some((q) => "size" in q)).toBe(false)
  })

  it("builds the questions of all of a template's presets", () => {
    const questions = buildTemplateQuestions("sitsit", languages)
    expect(presetKeysOf(questions)).toEqual([
      "telegram",
      "alcohol",
      "specialDiets",
      "seating",
      "bindingRegistration",
    ])
    // specialDiets adds two questions
    expect(questions).toHaveLength(6)
    expect(questions[1]).toEqual({
      type: "RADIO",
      isRequired: true,
      label: { fi: "Alkoholivalinta", en: "Alcohol preference" },
      data: [
        { fi: "Holiton", en: "Non-alcoholic" },
        { fi: "Holillinen", en: "Alcoholic" },
        { fi: "Holittomat shotit", en: "Non-alcoholic shots" },
      ],
      presetKey: "alcohol",
      templateKey: "sitsit",
    })
  })

  it("falls back to English for a language the presets have no text in", () => {
    const [question] = buildPresetQuestions("seating", ["SE"])
    expect(question.label).toEqual({ se: "Seating preferences" })
    expect(question.data).toBeNull()
  })

  it("returns nothing for an unknown template", () => {
    expect(buildTemplateQuotas("nope", languages)).toEqual([])
    expect(buildTemplateQuestions("nope", languages)).toEqual([])
  })
})

describe("list helpers", () => {
  // An item added by hand
  const own: TemplateItem & { title: Record<string, string> } = {
    title: { fi: "Oma" },
  }
  const ticked = buildPresetQuota("open", ["fi"])
  const fromTemplate = buildTemplateQuotas("yearGroups", ["fi"])

  it("adds newly ticked presets and removes unticked ones, keeping own items", () => {
    const items = [own, ticked]
    const next = togglePresets(items, ["I"], (key) => [
      buildPresetQuota(key, ["fi"]),
    ])
    expect(next).toEqual([own, { title: { fi: "I" }, presetKey: "I" }])
  })

  it("does not add a ticked preset twice", () => {
    const build = jest.fn((key: string) => [buildPresetQuota(key, ["fi"])])
    expect(togglePresets([own, ticked], ["open"], build)).toEqual([own, ticked])
    expect(build).not.toHaveBeenCalled()
  })

  it("leaves hand-ticked presets out of a template", () => {
    const handTicked = buildPresetQuota("I", ["fi"])
    const built = withoutHandPickedPresets([own, handTicked], fromTemplate)
    expect(presetKeysOf(built)).toEqual(["II", "III", "IV", "N"])
  })

  it("replaces the previous template's items and keeps the rest", () => {
    const items = [own, ticked, ...fromTemplate]
    expect(hasTemplateItems(items)).toBe(true)
    expect(replaceTemplateItems(items, [])).toEqual([own, ticked])
    expect(hasTemplateItems([own, ticked, undefined])).toBe(false)
  })
})

describe("a form filled from templates", () => {
  it("submits ordinary quotas and questions", () => {
    const quotas = buildTemplateQuotas("yearGroups", languages).map((q) => ({
      ...q,
      size: 10,
    }))
    const questions = buildTemplateQuestions("sitsit", languages)
    const { quotas: quotaInput, questions: questionInput } = toEventInput({
      name: { fi: "Sitsit" },
      eventTime: [dayjs("2030-05-01T15:00:00Z"), dayjs("2030-05-01T22:00:00Z")],
      registrationTime: [
        dayjs("2030-04-01T09:00:00Z"),
        dayjs("2030-04-20T20:59:59Z"),
      ],
      quotas,
      questions,
    } as any)

    expect(quotaInput[0]).toEqual({
      position: 0,
      title: { fi: "I", en: "I" },
      size: 10,
    })
    expect(questionInput?.[0]).toEqual({
      position: 0,
      type: "TEXT",
      label: { fi: "Telegram", en: "Telegram" },
      isRequired: true,
      data: null,
      prefill: "NONE",
    })
    for (const item of [...quotaInput, ...(questionInput ?? [])]) {
      expect(item).not.toHaveProperty("presetKey")
      expect(item).not.toHaveProperty("templateKey")
    }
  })
})
