import nodemailer from "nodemailer"

import { registrationCalendarInvitation } from "../src/calendarInvitation"
import {
  getLocalEmailSettings,
  localRecipientAllowed,
  parseLocalEmailSettings,
} from "../src/localEmail"

const event = {
  id: "test-event",
  slug: "test-event",
  name: { fi: "Testitapahtuma", en: "Test event" },
  description: {
    fi: [{ type: "paragraph", children: [{ text: "Tervetuloa!" }] }],
  },
  location: "Otaniemi",
  event_start_time: "2026-10-24T18:00:00+03:00",
  event_end_time: "2026-10-24T22:00:00+03:00",
}

it("uses a strict recipient allowlist for local delivery", () => {
  const settings = parseLocalEmailSettings({
    transport: "sendgrid",
    allowedRecipients: ["Tester@example.com"],
  })
  expect(localRecipientAllowed("tester@example.com", settings)).toBe(true)
  expect(localRecipientAllowed(" TESTER@example.com ", settings)).toBe(true)
  expect(
    localRecipientAllowed(["tester@example.com", "other@example.com"], settings)
  ).toBe(false)
  expect(
    localRecipientAllowed("tester@example.com,other@example.com", settings)
  ).toBe(false)
  expect(localRecipientAllowed([], settings)).toBe(false)
  expect(() =>
    parseLocalEmailSettings({ transport: "sendgrid", allowedRecipients: [] })
  ).toThrow()
  expect(() =>
    parseLocalEmailSettings({
      transport: "sendgrid",
      allowedRecipients: ["a@example.com\nb@example.com"],
    })
  ).toThrow()
})

it("ignores the local delivery configuration during automated tests", async () => {
  expect(await getLocalEmailSettings()).toBeUndefined()
})

it("includes a private, correctly timed invitation without registration secrets", () => {
  const invitation = registrationCalendarInvitation(
    event,
    "tester@example.com",
    "http://192.168.1.42:5678"
  )
  expect(invitation.method).toBe("REQUEST")
  expect(invitation.content).toContain("METHOD:REQUEST\r\n")
  expect(invitation.content).toContain("DTSTART:20261024T150000Z\r\n")
  expect(invitation.content).toContain("DTEND:20261024T190000Z\r\n")
  expect(invitation.content).toContain(
    "ORGANIZER:mailto:no-reply@prodeko.org\r\n"
  )
  expect(invitation.content).toContain(
    "ATTENDEE;RSVP=FALSE:mailto:tester@example.com\r\n"
  )
  expect(invitation.content).toContain("SUMMARY:Testitapahtuma\r\n")
  expect(invitation.content).toContain("DESCRIPTION:Tervetuloa!")
  expect(invitation.content).not.toContain("update-registration")
})

it("renders a real multipart email with the confirmation body and calendar part", async () => {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
  })
  const result = await transport.sendMail({
    from: "no-reply@prodeko.org",
    to: "tester@example.com",
    subject: "Registration confirmed",
    text: "Your registration was saved.",
    html: "<p>Your registration was saved.</p>",
    icalEvent: registrationCalendarInvitation(
      event,
      "tester@example.com",
      "https://example.com"
    ),
  })
  const message = result.message.toString()
  expect(message).toContain("Your registration was saved.")
  expect(message).toMatch(/Content-Type: text\/calendar;[^]*?method=REQUEST/i)
  expect(message).toContain("event.ics")
})
