interface CalendarEvent {
  id: string
  name: string
  location: string
  description: string
  start: string
  end: string
  url: string
}

// Calendar TEXT values must not introduce new properties or components.
function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
}

function timestamp(value: string | Date) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

export function createCalendarLinks(event: CalendarEvent) {
  const description = [event.description, event.url]
    .filter(Boolean)
    .join("\n\n")
  // The eventedit path can launch Android's Calendar app without passing on
  // the template fields. Use the web template entry point instead. A phone's
  // app-link settings can still affect how the link opens.
  const google = new URL("https://www.google.com/calendar/render")
  google.search = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${timestamp(event.start)}/${timestamp(event.end)}`,
    details: description,
    location: event.location,
  }).toString()

  const outlookParams = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.name,
    startdt: new Date(event.start).toISOString(),
    enddt: new Date(event.end).toISOString(),
    body: description,
    location: event.location,
  }).toString()

  return {
    google: google.href,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams}`,
    microsoft365: `https://outlook.office.com/calendar/0/deeplink/compose?${outlookParams}`,
  }
}

// RFC 5545 limits content lines to 75 octets, including continuation spaces.
function foldLine(line: string) {
  const encoder = new TextEncoder()
  let result = ""
  let length = 0
  for (const character of line) {
    const size = encoder.encode(character).length
    if (length + size > 75) {
      result += "\r\n "
      length = 1
    }
    result += character
    length += size
  }
  return result
}

export function createEventCalendar(
  event: CalendarEvent,
  now = new Date(),
  invitation?: { organizer: string; attendee: string }
) {
  const calendarAddress = (address: string) => {
    if (/[\r\n]/.test(address))
      throw new Error("Invalid calendar email address")
    return encodeURI(address).replace(/[;,]/g, encodeURIComponent)
  }
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Ilmo//Event Calendar//EN",
      "CALSCALE:GREGORIAN",
      ...(invitation ? ["METHOD:REQUEST"] : []),
      "BEGIN:VEVENT",
      `UID:${escapeText(event.id)}@ilmo`,
      `DTSTAMP:${timestamp(now)}`,
      `DTSTART:${timestamp(event.start)}`,
      `DTEND:${timestamp(event.end)}`,
      `SUMMARY:${escapeText(event.name)}`,
      `LOCATION:${escapeText(event.location)}`,
      `DESCRIPTION:${escapeText([event.description, event.url].filter(Boolean).join("\n\n"))}`,
      `URL:${event.url.replace(/[\r\n]/g, "")}`,
      ...(invitation
        ? [
            "SEQUENCE:0",
            `ORGANIZER:mailto:${calendarAddress(invitation.organizer)}`,
            `ATTENDEE;RSVP=FALSE:mailto:${calendarAddress(invitation.attendee)}`,
          ]
        : []),
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(foldLine)
      .join("\r\n") + "\r\n"
  )
}

// Event descriptions are translated Slate documents, rather than HTML.
export function calendarDescription(node: unknown): string {
  if (Array.isArray(node)) return node.map(calendarDescription).join("\n")
  if (!node || typeof node !== "object") return ""
  if ("text" in node && typeof node.text === "string") return node.text
  if ("children" in node && Array.isArray(node.children)) {
    const separator =
      "type" in node &&
      ["bulleted-list", "numbered-list"].includes(String(node.type))
        ? "\n"
        : ""
    return node.children.map(calendarDescription).join(separator)
  }
  return ""
}
