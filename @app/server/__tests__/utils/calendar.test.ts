import {
  calendarDescription,
  createCalendarLinks,
  createEventCalendar,
} from "../../../lib/src/calendar"

const event = {
  id: "event-123",
  name: "Sitsit, syksy; 🎉",
  description: "Line one\nLine two\\three",
  location: "Otaniemi",
  start: "2026-10-24T18:00:00+03:00",
  end: "2026-10-24T22:00:00+03:00",
  url: "http://192.168.1.42:5678/event/test",
}

it("prefills Google Calendar with encoded text and UTC event times", () => {
  const url = new URL(createCalendarLinks(event).google)
  expect(url.origin).toBe("https://www.google.com")
  expect(url.pathname).toBe("/calendar/render")
  expect(url.searchParams.get("action")).toBe("TEMPLATE")
  expect(url.searchParams.get("text")).toBe(event.name)
  expect(url.searchParams.get("dates")).toBe(
    "20261024T150000Z/20261024T190000Z"
  )
  expect(url.searchParams.get("details")).toBe(
    `${event.description}\n\n${event.url}`
  )
  expect(url.searchParams.get("location")).toBe(event.location)
})

it("prefills both Outlook account types without letting text add URL parameters", () => {
  const name = "Dinner & location=wrong # åäö 🎉"
  const links = createCalendarLinks({ ...event, name })
  for (const [key, origin] of [
    ["outlook", "https://outlook.live.com"],
    ["microsoft365", "https://outlook.office.com"],
  ] as const) {
    const url = new URL(links[key])
    expect(url.origin).toBe(origin)
    expect(url.searchParams.get("subject")).toBe(name)
    expect(url.searchParams.getAll("location")).toEqual([event.location])
    expect(url.searchParams.get("startdt")).toBe("2026-10-24T15:00:00.000Z")
    expect(url.searchParams.get("enddt")).toBe("2026-10-24T19:00:00.000Z")
    expect(url.searchParams.get("body")).toBe(
      `${event.description}\n\n${event.url}`
    )
  }
})

it("exports the actual event times in UTC and a stable UID", () => {
  const calendar = createEventCalendar(event, new Date("2026-10-17T10:00:00Z"))
  expect(calendar).toContain("DTSTART:20261024T150000Z\r\n")
  expect(calendar).toContain("DTEND:20261024T190000Z\r\n")
  expect(calendar).toContain("DTSTAMP:20261017T100000Z\r\n")
  expect(calendar).toContain("UID:event-123@ilmo\r\n")
  expect(calendar).toContain("URL:http://192.168.1.42:5678/event/test\r\n")
  expect(calendar).toMatch(/END:VEVENT\r\nEND:VCALENDAR\r\n$/)
})

it("escapes text and prevents injected calendar properties", () => {
  const calendar = createEventCalendar({
    ...event,
    location: "Hall\r\nEND:VEVENT",
  })
  expect(calendar).toContain("SUMMARY:Sitsit\\, syksy\\; 🎉\r\n")
  expect(calendar).toContain("LOCATION:Hall\\nEND:VEVENT\r\n")
  expect(calendar).toContain("Line one\\nLine two\\\\three")
  expect(calendar.match(/^END:VEVENT$/gm)).toHaveLength(1)
})

it("folds long UTF-8 lines without splitting characters", () => {
  const name = "🎉ä".repeat(100)
  const calendar = createEventCalendar({ ...event, name })
  for (const line of calendar.split("\r\n")) {
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75)
  }
  expect(calendar.replace(/\r\n /g, "")).toContain(`SUMMARY:${name}\r\n`)
})

it("converts Slate paragraphs, inline formatting and lists to plain text", () => {
  expect(
    calendarDescription([
      {
        type: "paragraph",
        children: [{ text: "Hello " }, { text: "world", bold: true }],
      },
      {
        type: "bulleted-list",
        children: [
          { type: "list-item", children: [{ text: "One" }] },
          { type: "list-item", children: [{ text: "Two" }] },
        ],
      },
    ])
  ).toBe("Hello world\nOne\nTwo")
  expect(calendarDescription(null)).toBe("")
})
