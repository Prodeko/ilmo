import { fromEmail } from "@app/config"
import { calendarDescription, createEventCalendar } from "@app/lib"

export interface InvitationEvent {
  id: string
  slug: string
  name: Record<string, string>
  description: Record<string, unknown>
  location: string
  event_start_time: string | Date
  event_end_time: string | Date
}

export function registrationCalendarInvitation(
  event: InvitationEvent,
  recipient: string,
  rootUrl: string
) {
  const description = event.description || {}
  return {
    method: "REQUEST" as const,
    filename: "event.ics",
    content: createEventCalendar(
      {
        id: event.id,
        name: event.name.fi || event.name.en || Object.values(event.name)[0],
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
