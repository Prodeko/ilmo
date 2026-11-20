import { QuestionType } from "@app/graphql"

type LocalizedText = { fi: string; en: string }

type TemplateQuestion = {
  type: QuestionType
  isRequired: boolean
  label: LocalizedText
  data?: LocalizedText[]
}

type TemplateQuota = {
  title: LocalizedText
}

// Ready-made questions the event creator can add with checkboxes on the
// questions tab. A preset can add more than one question. Question
// templates are built from these.
export const questionPresets: Record<string, TemplateQuestion[]> = {
  telegram: [
    {
      type: QuestionType.Text,
      isRequired: true,
      label: { fi: "Telegram", en: "Telegram" },
    },
  ],
  alcohol: [
    {
      type: QuestionType.Radio,
      isRequired: true,
      label: { fi: "Alkoholivalinta", en: "Alcohol preference" },
      data: [
        { fi: "Holiton", en: "Non-alcoholic" },
        { fi: "Holillinen", en: "Alcoholic" },
        { fi: "Holittomat shotit", en: "Non-alcoholic shots" },
      ],
    },
  ],
  // Common diets as checkboxes, plus a free text field for anything else
  specialDiets: [
    {
      type: QuestionType.Checkbox,
      isRequired: false,
      label: { fi: "Erityisruokavalio", en: "Special diet" },
      data: [
        { fi: "Kasvis", en: "Vegetarian" },
        { fi: "Laktoositon", en: "Lactose-free" },
        { fi: "Gluteeniton", en: "Gluten-free" },
        { fi: "Vegaani", en: "Vegan" },
      ],
    },
    {
      type: QuestionType.Text,
      isRequired: false,
      label: {
        fi: "Muu erityisruokavalio tai allergia",
        en: "Other special diet or allergy",
      },
    },
  ],
  seating: [
    {
      type: QuestionType.Text,
      isRequired: false,
      label: { fi: "Paikkatoiveet", en: "Seating preferences" },
    },
  ],
  avec: [
    {
      type: QuestionType.Text,
      isRequired: false,
      label: { fi: "Avec", en: "Avec" },
    },
  ],
  // A required checkbox with a single option, i.e. the registrant must tick it
  bindingRegistration: [
    {
      type: QuestionType.Checkbox,
      isRequired: true,
      label: { fi: "Sitova ilmoittautuminen", en: "Binding registration" },
      data: [
        {
          fi: "Ymmärrän, että osallistumismaksu muuttuu sitovaksi ilmoittautumisen päätyttyä",
          en: "I understand that the participation fee becomes binding once registration closes",
        },
      ],
    },
  ],
}

// The `key` of a template is used as the value of the template selector and
// for its UI translation `events:templates.<questions|quotas>.<key>`
export type QuestionTemplate = { key: string; presets: string[] }
export type QuotaTemplate = { key: string; presets: string[] }

export const NO_TEMPLATE = "none"

export const questionTemplates: QuestionTemplate[] = [
  {
    key: "sitsit",
    presets: [
      "telegram",
      "alcohol",
      "specialDiets",
      "seating",
      "bindingRegistration",
    ],
  },
]

// Ready-made quotas the event creator can add with checkboxes on the quotas
// tab, one per year group. Quota templates are built from these.
const yearGroups = ["I", "II", "III", "IV", "N"]
export const quotaPresets: Record<string, TemplateQuota> = {
  // A regular quota anyone can register to, e.g. for events without year
  // groups. Not the same as the event's overflow ("open") quota.
  open: { title: { fi: "Avoin kiintiö", en: "Open quota" } },
  ...Object.fromEntries(
    yearGroups.map((title) => [title, { title: { fi: title, en: title } }])
  ),
}

export const quotaTemplates: QuotaTemplate[] = [
  {
    key: "yearGroups",
    presets: yearGroups,
  },
]

function localize(text: LocalizedText, languages: string[]) {
  return Object.fromEntries(
    languages.map((l) => {
      const lang = l.toLowerCase()
      return [lang, text[lang as keyof LocalizedText] ?? text.en]
    })
  )
}

/**
 * The build functions below return EventForm list values. Texts are only
 * filled in for the event's selected languages. Each item is marked with
 * `presetKey` and/or `templateKey` so it can be removed again from the
 * checkboxes or the template selector; the keys are dropped when the form is
 * submitted.
 */

export function buildPresetQuestions(
  presetKey: string,
  languages: string[],
  templateKey?: string
) {
  return questionPresets[presetKey].map((q) => ({
    type: q.type,
    isRequired: q.isRequired,
    label: localize(q.label, languages),
    data: q.data ? q.data.map((d) => localize(d, languages)) : null,
    presetKey,
    templateKey,
  }))
}

export function buildTemplateQuestions(
  templateKey: string,
  languages: string[]
) {
  const template = questionTemplates.find((t) => t.key === templateKey)
  if (!template) return []

  return template.presets.flatMap((presetKey) =>
    buildPresetQuestions(presetKey, languages, templateKey)
  )
}

export function buildPresetQuota(
  presetKey: string,
  languages: string[],
  templateKey?: string
) {
  // Size is left empty on purpose so the event creator has to set it
  return {
    title: localize(quotaPresets[presetKey].title, languages),
    presetKey,
    templateKey,
  }
}

export function buildTemplateQuotas(templateKey: string, languages: string[]) {
  const template = quotaTemplates.find((t) => t.key === templateKey)
  if (!template) return []

  return template.presets.map((presetKey) =>
    buildPresetQuota(presetKey, languages, templateKey)
  )
}
