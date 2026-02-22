import dayjs from "dayjs"
import { createEvent } from "ics"

interface CalendarInviteAttachment {
  filename: string
  content: string
  contentType: string
}

export async function generateCalendarInvite(
  event: any
): Promise<CalendarInviteAttachment | null> {
  const { event_start_time, event_end_time, name, location } = event

  const startDate = dayjs(event_start_time)
  const endDate = dayjs(event_end_time)

  const calendarEvent = {
    start: [
      startDate.year(),
      startDate.month() + 1, // month is 0-indexed in dayjs
      startDate.date(),
      startDate.hour(),
      startDate.minute(),
    ] as [number, number, number, number, number],
    end: [
      endDate.year(),
      endDate.month() + 1,
      endDate.date(),
      endDate.hour(),
      endDate.minute(),
    ] as [number, number, number, number, number],
    title: name.fi || name.en || "Unknown Prodeko Event",
    location: location || "",
    status: "CONFIRMED" as const,
    busyStatus: "BUSY" as const,
  }

  return new Promise((resolve, reject) => {
    createEvent(calendarEvent, (error, value) => {
      if (error) {
        console.error("Error creating calendar event:", error)
        reject(error)
        return
      }
      resolve({
        filename: "event.ics",
        content: value,
        contentType: "text/calendar; method=REQUEST",
      })
    })
  })
}
