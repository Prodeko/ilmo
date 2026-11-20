import { fromEmail } from "@app/config"
import { calendarDescription, createEventCalendar } from "@app/lib"

import { isFeatureEnabled } from "./featureFlags"

import type {
  RegistrationEmailContext,
  RegistrationEmailContribution,
} from "./registrationEmail"
import type { EmailAttachment } from "./tasks/send_email"

export interface InvitationEvent {
  id: string
  slug: string
  name: Record<string, string | undefined>
  description?: Record<string, unknown> | null
  location: string
  event_start_time: string | Date
  event_end_time: string | Date
}

export const CALENDAR_INVITATION_FILENAME = "event.ics"
export const CALENDAR_INVITATION_CONTENT_TYPE = "text/calendar; method=REQUEST"

/** Statuses of a confirmed place; a queued registration gets no invitation. */
const PLACE_STATUSES = ["IN_QUOTA", "IN_OPEN_QUOTA"]

/** The iCalendar (METHOD:REQUEST) invitation to an event for one attendee. */
export function registrationCalendarInvitation(
  event: InvitationEvent,
  recipient: string,
  rootUrl: string
): EmailAttachment {
  const description = event.description || {}
  return {
    filename: CALENDAR_INVITATION_FILENAME,
    contentType: CALENDAR_INVITATION_CONTENT_TYPE,
    content: createEventCalendar(
      {
        id: event.id,
        name:
          event.name.fi || event.name.en || Object.values(event.name)[0] || "",
        description: calendarDescription(
          description.fi || description.en || Object.values(description)[0]
        ),
        location: event.location || "",
        start: new Date(event.event_start_time).toISOString(),
        end: new Date(event.event_end_time).toISOString(),
        url: new URL(`/event/${encodeURIComponent(event.slug)}`, rootUrl).href,
      },
      new Date(),
      {
        organizer: fromEmail.match(/<([^>]+)>/)?.[1] || fromEmail,
        attendee: recipient,
      }
    ),
  }
}

/**
 * Registration email contributor: attaches a calendar invitation to the
 * confirmation of a registration that has a place, and to the notice of a
 * place received from the queue, while `calendar_invites` is enabled.
 */
export async function calendarInvitationContributor(
  ctx: RegistrationEmailContext
): Promise<RegistrationEmailContribution> {
  const { kind, query, registration, event, rootUrl } = ctx
  if (!rootUrl || !registration.email) {
    return {}
  }
  if (!(await isFeatureEnabled(query, "calendar_invites"))) {
    return {}
  }
  if (
    kind === "confirmation" &&
    !PLACE_STATUSES.includes(registration.status ?? "")
  ) {
    return {}
  }
  return {
    attachments: [
      registrationCalendarInvitation(event, registration.email, rootUrl),
    ],
  }
}
