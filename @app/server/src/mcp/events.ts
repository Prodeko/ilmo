import {
  CreateEventInput,
  McpEventOptionsQuery,
  QuestionType,
} from "@app/graphql"
import slugify from "slugify"

export interface Translated {
  fi: string
  en?: string
}

export interface NewEvent {
  organizationId: string
  categoryId: string
  name: Translated
  description: { fi?: string; en?: string }
  location: string
  eventStartTime: string
  eventEndTime: string
  registrationStartTime: string
  registrationEndTime: string
  openQuotaSize: number
  isHighlighted: boolean
  quotas: { title: Translated; size: number }[]
  questions: {
    type: QuestionType
    label: Translated
    required: boolean
    options?: Translated[]
  }[]
}

function translated(value: Translated) {
  return value.en ? { fi: value.fi, en: value.en } : { fi: value.fi }
}

/** Plain text to the editor's Slate document: blank lines separate paragraphs. */
export function plainToRichText(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph", children: [{ text: p }] }))
}

/**
 * Same shape as the admin form's slug (getEventSlug in @app/components): the
 * start date as YYYY-M-D in Finnish time, then the Finnish name.
 */
export function eventSlug(name: Translated, eventStartTime: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(eventStartTime))
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value)
  const day = `${part("year")}-${part("month")}-${part("day")}`
  return slugify(`${day}-${name.fi}`, { lower: true })
}

type Options = NonNullable<McpEventOptionsQuery>

export function validateNewEvent(event: NewEvent, options: Options): string[] {
  const errors: string[] = []
  const time = (field: keyof NewEvent) =>
    new Date(event[field] as string).getTime()

  if (
    !options.organizations?.nodes.some((o) => o.id === event.organizationId)
  ) {
    errors.push("organizationId is not an organization.")
  }
  const category = options.eventCategories?.nodes.find(
    (c) => c.id === event.categoryId
  )
  if (!category) {
    errors.push("categoryId is not an event category.")
  } else if (category.ownerOrganization?.id !== event.organizationId) {
    errors.push("The category belongs to another organization.")
  }

  if (!event.description.fi?.trim() && !event.description.en?.trim()) {
    errors.push("A description in Finnish or English is required.")
  }
  if (time("eventStartTime") >= time("eventEndTime")) {
    errors.push("The event must end after it starts.")
  }
  if (time("registrationStartTime") >= time("registrationEndTime")) {
    errors.push("Registration must close after it opens.")
  }
  if (time("registrationEndTime") >= time("eventStartTime")) {
    errors.push("Registration must close before the event starts.")
  }
  if (event.quotas.length === 0 && event.openQuotaSize < 1) {
    errors.push("Give at least one quota or an open quota size above zero.")
  }

  event.questions.forEach((q, i) => {
    const options = q.options ?? []
    if (q.type === QuestionType.Text && options.length > 0) {
      errors.push(`Question ${i + 1}: TEXT questions take no options.`)
    }
    if (q.type !== QuestionType.Text && options.length === 0) {
      errors.push(`Question ${i + 1}: ${q.type} questions need options.`)
    }
  })

  return errors
}

export function createEventInput(event: NewEvent): CreateEventInput {
  const description: Record<string, ReturnType<typeof plainToRichText>> = {}
  if (event.description.fi?.trim()) {
    description.fi = plainToRichText(event.description.fi)
  }
  if (event.description.en?.trim()) {
    description.en = plainToRichText(event.description.en)
  }

  return {
    event: {
      slug: eventSlug(event.name, event.eventStartTime),
      name: translated(event.name),
      description,
      location: event.location,
      eventStartTime: event.eventStartTime,
      eventEndTime: event.eventEndTime,
      registrationStartTime: event.registrationStartTime,
      registrationEndTime: event.registrationEndTime,
      isHighlighted: event.isHighlighted,
      isDraft: true,
      openQuotaSize: event.openQuotaSize,
      ownerOrganizationId: event.organizationId,
      categoryId: event.categoryId,
    },
    quotas: event.quotas.map((q, position) => ({
      position,
      title: translated(q.title),
      size: q.size,
    })),
    questions: event.questions.map((q, position) => ({
      position,
      type: q.type,
      label: translated(q.label),
      isRequired: q.required,
      data: q.type === QuestionType.Text ? null : q.options!.map(translated),
    })),
  }
}
