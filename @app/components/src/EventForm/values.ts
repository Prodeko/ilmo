// Mapping between an event and the event form's values. An event field is
// added to the form in three places here: FormValues, toFormValues and
// toEventInput.
import { filterObjectByKeys } from "@app/lib"
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
  // The stored image's URL until a new file is chosen
  headerImageFile?: string | UploadFile
  isDraft?: boolean
  openQuotaSize?: number
  quotas?: Quota[]
  questions?: EventQuestion[]
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
  const quotas = quotasConnection?.nodes.map((quota) =>
    filterObjectByKeys(quota, [
      "id",
      "position",
      "title",
      "size",
      "registrations",
    ])
  )
  const questions = questionsConnection?.nodes.map((question) =>
    filterObjectByKeys(question, [
      "id",
      "position",
      "type",
      "label",
      "isRequired",
      "data",
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
export function toEventInput(values: SubmittedFormValues): EventInput {
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
    formQuotas?.map((q, index) =>
      filterObjectByKeys({ ...q, position: index }, [
        "id",
        "position",
        "title",
        "size",
      ])
    ) || []

  // Questions may be empty
  const questions = formQuestions?.map((q, index) =>
    filterObjectByKeys(
      { ...q, position: index, isRequired: q.isRequired ?? false },
      ["id", "position", "type", "label", "isRequired", "data"]
    )
  )

  return { event, quotas, questions }
}
