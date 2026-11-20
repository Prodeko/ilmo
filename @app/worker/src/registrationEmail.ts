import dayjs from "dayjs"

import { calendarInvitationContributor } from "./calendarInvitation"

import type { EmailAttachment, SendEmailPayload } from "./tasks/send_email"
import type { JobHelpers } from "graphile-worker"

/*
 * Builds the emails sent about a single registration: the confirmation after
 * registering and the notice of a spot received from the queue.
 *
 * The builder loads the registration, its event, quota and secret once, runs
 * the checks of the email kind, assembles the base payload and merges in the
 * output of every contributor. A new block in these emails is a contributor
 * (plus a partial in the template), not an edit to the tasks.
 */

type Query = JobHelpers["query"]

export type RegistrationEmailKind = "confirmation" | "spotFromQueue"

/* Rows are `select *`; only the columns used here are typed. */
export interface RegistrationRow {
  id: string
  event_id: string
  quota_id: string
  email: string | null
  first_name: string
  last_name: string
  is_finished: boolean
  /** `app_public.registrations_status(registration)` */
  status: string | null
  [column: string]: any
}
export interface EventRow {
  id: string
  slug: string
  name: { fi?: string; en?: string; [lang: string]: string | undefined }
  location: string
  event_start_time: string | Date
  event_end_time: string | Date
  [column: string]: any
}
export interface QuotaRow {
  id: string
  title: { [lang: string]: string }
  [column: string]: any
}
export interface RegistrationSecretRow {
  registration_id: string
  update_token: string
  confirmation_email_sent: boolean
  received_spot_from_queue_email_sent: boolean
  [column: string]: any
}

/** Everything a contributor can read. All rows have passed the checks. */
export interface RegistrationEmailContext {
  kind: RegistrationEmailKind
  query: Query
  rootUrl: string | undefined
  registration: RegistrationRow
  event: EventRow
  quota: QuotaRow
  registrationSecret: RegistrationSecretRow
}

export interface RegistrationEmailContribution {
  /** Merged into the template variables, after the base variables. */
  variables?: { [varName: string]: any }
  /** Appended to the email's attachments. */
  attachments?: EmailAttachment[]
}

/**
 * Adds a block to the registration emails. It checks its own flag and
 * conditions, and returns `{}` when it has nothing to add, so that the email
 * is unchanged. Contributors run in parallel; their output is merged in list
 * order. A contributor that throws fails the job (graphile-worker retries
 * it); catch inside the contributor if its block is optional.
 */
export type RegistrationEmailContributor = (
  ctx: RegistrationEmailContext
) => Promise<RegistrationEmailContribution>

/** The contributors of the registration emails, in merge order. */
export const registrationEmailContributors: RegistrationEmailContributor[] = [
  calendarInvitationContributor,
]

export function getFormattedEventTime(event: {
  event_start_time: string | Date
  event_end_time: string | Date
}) {
  const { event_start_time, event_end_time } = event
  const formatString = "D.M.YY HH:mm"
  const startTime = dayjs(event_start_time).format(formatString)
  const endTime = dayjs(event_end_time).format(formatString)
  return `${startTime} - ${endTime}`
}

interface LoadedRows {
  registration: RegistrationRow | undefined
  event: EventRow | undefined
  quota: QuotaRow | undefined
  registrationSecret: RegistrationSecretRow | undefined
}

type CheckedRows = {
  [K in keyof LoadedRows]-?: NonNullable<LoadedRows[K]>
}

interface KindSpec {
  /** Checks in order; logs and returns false to abort, or throws. */
  check(rows: LoadedRows): rows is CheckedRows
  subject(rows: CheckedRows): string
  /** Template variables of this kind, merged after the shared ones. */
  variables?(rows: CheckedRows): { [varName: string]: any }
  template: string
  /** Marks the email of this kind as sent for the registration. */
  markSentSql: string
}

function isQueued(registration: RegistrationRow) {
  return registration.status === "IN_QUEUE"
}

function abort(message: string): false {
  console.error(message)
  return false
}

const kinds: Record<RegistrationEmailKind, KindSpec> = {
  confirmation: {
    check(rows): rows is CheckedRows {
      const { registration, event, quota, registrationSecret } = rows
      if (!registration) return abort("Registration not found; aborting")
      if (!registration.is_finished) {
        return abort("Registration is not finished; aborting")
      }
      if (!event) return abort("No event found; aborting")
      if (!quota) return abort("No quota found; aborting")
      if (!registrationSecret) {
        return abort("No registration secrets found; aborting")
      }
      if (registrationSecret.confirmation_email_sent) {
        return abort("Confirmation email already sent; aborting")
      }
      if (!registration.email) return abort("No email specified; aborting")
      return true
    },
    subject: ({ event, registration }) => {
      const queued = isQueued(registration)
      return event.name.fi
        ? `${event.name.fi} - ${queued ? "Ilmoittautuminen jonoon" : "Ilmoittautuminen onnistui"}`
        : `${event.name.en} - ${queued ? "Added to waiting list" : "Registration successful"}`
    },
    variables: ({ registration }) => ({
      isWaitlisted: isQueued(registration),
    }),
    template: "event_registration.mjml.njk",
    markSentSql:
      "update app_private.registration_secrets set confirmation_email_sent = true where registration_id = $1",
  },
  spotFromQueue: {
    check(rows): rows is CheckedRows {
      const { registration, event, quota, registrationSecret } = rows
      if (!registrationSecret) {
        return abort("No registration secrets found; aborting")
      }
      if (registrationSecret.received_spot_from_queue_email_sent) {
        return abort("Received spot from queue email already sent; aborting")
      }
      if (!registration) {
        // A secret without its registration cannot exist (the foreign key
        // cascades); fail the job rather than skip the email silently.
        throw new Error("Registration not found")
      }
      if (!registration.is_finished) {
        return abort("Registration is not finished; aborting")
      }
      if (!event || !quota) {
        return abort("Event or quota not found; aborting")
      }
      if (!registration.email) return abort("No email specified; aborting")
      return true
    },
    subject: ({ event }) =>
      event.name.fi
        ? `${event.name.fi} - Olet saanut paikan jonosta`
        : `${event.name.en} - You have received a spot from the queue`,
    template: "spot_from_queue.mjml.njk",
    markSentSql:
      "update app_private.registration_secrets set received_spot_from_queue_email_sent = true where registration_id = $1",
  },
}

async function loadRows(
  query: Query,
  registrationId: string
): Promise<LoadedRows> {
  const {
    rows: [registration],
  } = await query<RegistrationRow>(
    "select r.*, app_public.registrations_status(r) as status from app_public.registrations as r where r.id = $1",
    [registrationId]
  )
  const {
    rows: [registrationSecret],
  } = await query<RegistrationSecretRow>(
    "select * from app_private.registration_secrets where registration_id = $1",
    [registrationId]
  )
  if (!registration) {
    return {
      registration,
      event: undefined,
      quota: undefined,
      registrationSecret,
    }
  }
  const {
    rows: [event],
  } = await query<EventRow>("select * from app_public.events where id = $1", [
    registration.event_id,
  ])
  const {
    rows: [quota],
  } = await query<QuotaRow>("select * from app_public.quotas where id = $1", [
    registration.quota_id,
  ])
  return { registration, event, quota, registrationSecret }
}

/**
 * Loads a registration and builds the `send_email` payload of the given kind.
 * Returns null, after logging why, when the email must not be sent.
 */
export async function buildRegistrationEmail(
  query: Query,
  registrationId: string,
  kind: RegistrationEmailKind,
  contributors: RegistrationEmailContributor[] = registrationEmailContributors
): Promise<SendEmailPayload | null> {
  const spec = kinds[kind]
  const rows = await loadRows(query, registrationId)
  if (!spec.check(rows)) {
    return null
  }
  const { registration, event, quota, registrationSecret } = rows
  const rootUrl = process.env.ROOT_URL
  const ctx: RegistrationEmailContext = {
    kind,
    query,
    rootUrl,
    registration,
    event,
    quota,
    registrationSecret,
  }

  const contributions = await Promise.all(contributors.map((c) => c(ctx)))
  const variables = Object.assign(
    {
      url: rootUrl,
      eventName: event.name,
      registrationName: `${registration.first_name} ${registration.last_name}`,
      registrationQuota: quota.title,
      eventTime: getFormattedEventTime(event),
      eventSlug: event.slug,
      eventLocation: event.location,
      eventRegistrationUpdateLink: `update-registration/${registrationSecret.update_token}`,
      ...spec.variables?.(rows),
    },
    ...contributions.map((c) => c.variables)
  )
  const attachments = contributions.flatMap((c) => c.attachments ?? [])

  return {
    options: {
      to: registration.email!,
      subject: spec.subject(rows),
    },
    template: spec.template,
    variables,
    ...(attachments.length > 0 ? { attachments } : {}),
  }
}

/** Records that the email of this kind was queued for the registration. */
export async function markRegistrationEmailSent(
  query: Query,
  registrationId: string,
  kind: RegistrationEmailKind
): Promise<void> {
  await query(kinds[kind].markSentSql, [registrationId])
}
