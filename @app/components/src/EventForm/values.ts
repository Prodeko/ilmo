// Mapping between an event and the event form's values. An event field is
// added to the form in three places here: FormValues, toFormValues and
// toEventInput.
import { QuestionPrefill } from "@app/graphql"
import {
  filterObjectByKeys,
  ticketPriceCentsToEuros,
  ticketPriceEurosToCents,
} from "@app/lib"
import dayjs from "dayjs"
import slugify from "slugify"

import type {
  EventInputRecordInput,
  EventQuestion,
  Quota,
  Scalars,
  UpdateEventPageQuery,
  UpdateEventQuestionInput,
  UpdateEventQuotaInput,
} from "@app/graphql"
import type { UploadFile } from "antd/lib/upload/interface"
import type { JsonValue } from "type-fest"

// A quota in the form. The ticket price is edited in euros; it is undefined
// when the form has no price input for the quota (payments off).
export type FormQuota = Quota & { price?: number | null }

export type FormValues = {
  languages?: string[]
  ownerOrganizationId?: string
  categoryId?: string
  name?: Scalars["TranslatedField"]["input"]
  description?: JsonValue
  location?: string
  eventTime?: dayjs.Dayjs[]
  registrationTime?: dayjs.Dayjs[]
  isHighlighted?: boolean
  highlightText?: Scalars["TranslatedField"]["input"] | null
  // The stored image's URL until a new file is chosen
  headerImageFile?: string | UploadFile
  isDraft?: boolean
  openQuotaSize?: number
  quotas?: FormQuota[]
  questions?: EventQuestion[]
}

// Features that change what the form sends
export type EventInputOptions = {
  // Quota prices are sent only while payments are on, so that events are
  // saved exactly as before otherwise (and the database keeps stored prices:
  // it refuses a non-zero price while payments are off)
  payments?: boolean
}

// The form only submits once validation has passed, which requires both
// time ranges
export type SubmittedFormValues = FormValues &
  Required<Pick<FormValues, "eventTime" | "registrationTime">>

// The input shared by the createEvent and updateEvent mutations. Quotas and
// questions created in the form have no id yet
export type EventInput = {
  event: EventInputRecordInput
  quotas: UpdateEventQuotaInput[]
  questions?: UpdateEventQuestionInput[]
}

export function getEventSlug(
  name?: Scalars["TranslatedField"]["input"],
  dates?: dayjs.Dayjs[]
) {
  const eventStartTime = dates?.[0].toISOString()

  const nameFi = name?.fi
  const nameSlug = nameFi
    ? nameFi
    : Object.values(name || {})?.[0] || ("" as string)

  const daySlug = dayjs(eventStartTime).format("YYYY-M-D")
  const slug = slugify(`${daySlug}-${nameSlug}`, {
    lower: true,
  })

  return slug
}

// The ribbon texts to save: only non-empty texts in the selected languages,
// and none when the event is not highlighted. An empty result is null, which
// shows the default ribbon text.
function getHighlightText({
  isHighlighted,
  highlightText,
  languages,
}: FormValues): EventInputRecordInput["highlightText"] {
  const entries = Object.entries((isHighlighted && highlightText) || {})
    .map(([lang, text]) => [lang, text?.trim()] as const)
    .filter(([lang, text]) => text && languages?.includes(lang))
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

type UpdateFormEvent = NonNullable<UpdateEventPageQuery["event"]>

// The update form's initial values for an event loaded by UpdateEventPage
export function toFormValues(event: UpdateEventPageQuery["event"]) {
  const filteredValues = filterObjectByKeys(event, [
    "name",
    "slug",
    "description",
    "location",
    "eventStartTime",
    "eventEndTime",
    "registrationStartTime",
    "registrationEndTime",
    "isHighlighted",
    "highlightText",
    "isDraft",
    "headerImageFile",
    "quotas",
    "eventQuestions",
    "openQuotaSize",
  ]) as Partial<UpdateFormEvent> | null | undefined

  const {
    name,
    eventStartTime,
    eventEndTime,
    registrationStartTime,
    registrationEndTime,
    quotas: quotasConnection,
    eventQuestions: questionsConnection,
  } = filteredValues || {}

  const eventTime = [dayjs(eventStartTime), dayjs(eventEndTime)]
  const registrationTime = [
    dayjs(registrationStartTime),
    dayjs(registrationEndTime),
  ]
  const quotas = quotasConnection?.nodes.map((quota) => ({
    ...filterObjectByKeys(quota, [
      "id",
      "position",
      "title",
      "size",
      "registrations",
      "priceCents",
    ]),
    // The quota form edits the ticket price in euros
    price: ticketPriceCentsToEuros(quota.priceCents),
  }))
  const questions = questionsConnection?.nodes.map((question) =>
    filterObjectByKeys(question, [
      "id",
      "position",
      "type",
      "label",
      "isRequired",
      "data",
      "prefill",
    ])
  )
  const languages = Object.keys(name || {})

  return {
    ...filteredValues,
    languages,
    ownerOrganizationId: event?.ownerOrganization?.id,
    categoryId: event?.category?.id,
    registrationTime,
    eventTime,
    quotas,
    questions,
  }
}

// The createEvent and updateEvent input for the submitted form values
export function toEventInput(
  values: SubmittedFormValues,
  { payments = false }: EventInputOptions = {}
): EventInput {
  const {
    name,
    eventTime,
    registrationTime,
    openQuotaSize,
    quotas: formQuotas,
    questions: formQuestions,
    headerImageFile: headerFile,
  } = values

  const event: EventInputRecordInput = {
    ...filterObjectByKeys(values, [
      "ownerOrganizationId",
      "categoryId",
      "name",
      "description",
      "location",
      "isHighlighted",
      "isDraft",
    ]),
    slug: getEventSlug(name, eventTime),
    highlightText: getHighlightText(values),
    eventStartTime: eventTime[0].toISOString(),
    eventEndTime: eventTime[1].toISOString(),
    registrationStartTime: registrationTime[0].toISOString(),
    registrationEndTime: registrationTime[1].toISOString(),
    // Only a newly chosen file is uploaded; the stored image is kept otherwise
    headerImageFile:
      typeof headerFile === "object" ? headerFile?.originFileObj : undefined,
    openQuotaSize,
  }

  // The list order sets the positions
  const quotas =
    formQuotas?.map((q, index) => {
      const quota = filterObjectByKeys({ ...q, position: index }, [
        "id",
        "position",
        "title",
        "size",
      ])
      // A cleared price input is sent as 0 (free). Without a price in the
      // form, priceCents is omitted: the database keeps the current price,
      // or makes a new quota free.
      return payments && q.price !== undefined
        ? { ...quota, priceCents: ticketPriceEurosToCents(q.price) }
        : quota
    }) || []

  // Questions may be empty. The prefill is always sent: the database keeps
  // an omitted (null) prefill, so no prefill is sent as NONE, which clears it.
  const questions = formQuestions?.map((q, index) =>
    filterObjectByKeys(
      {
        ...q,
        position: index,
        isRequired: q.isRequired ?? false,
        prefill: q.prefill ?? QuestionPrefill.None,
      },
      ["id", "position", "type", "label", "isRequired", "data", "prefill"]
    )
  )

  return { event, quotas, questions }
}
