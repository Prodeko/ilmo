import { getLocalEmailSettings } from "../src/localEmail"
import sendEmail from "../src/tasks/send_email"
import getTransport from "../src/transport"

jest.mock("../src/transport", () => ({ __esModule: true, default: jest.fn() }))
jest.mock("../src/localEmail", () => ({
  ...jest.requireActual("../src/localEmail"),
  getLocalEmailSettings: jest.fn(),
}))

const sendMail = jest.fn().mockResolvedValue({ messageId: "test-message" })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getLocalEmailSettings).mockResolvedValue({
    transport: "sendgrid",
    allowedRecipients: ["tester@example.com"],
  })
  jest.mocked(getTransport).mockResolvedValue({ sendMail } as any)
})

it("does not contact any transport for a recipient outside the local allowlist", async () => {
  await sendEmail(
    {
      options: { to: "other@example.com", subject: "Test" },
      template: "",
      variables: {},
    },
    {} as any
  )
  expect(getTransport).not.toHaveBeenCalled()
  expect(sendMail).not.toHaveBeenCalled()
})

it.each([false, true])(
  "renders the registration email with waitlist status %s",
  async (isWaitlisted) => {
    const invitation = {
      method: "REQUEST",
      filename: "event.ics",
      content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    }
    await sendEmail(
      {
        options: {
          to: "tester@example.com",
          subject: "Test",
          icalEvent: invitation,
        },
        template: "event_registration.mjml.njk",
        variables: {
          isWaitlisted,
          eventName: { fi: "Testitapahtuma", en: "Test event" },
          registrationName: "Test User",
          registrationQuota: { fi: "Testi", en: "Test" },
          url: "https://example.com",
          eventSlug: "test-event",
          eventLocation: "Otaniemi",
          eventTime: "24.10.26 18:00",
          eventRegistrationUpdateLink: "update-registration/private-token",
        },
      },
      {} as any
    )
    expect(sendMail).toHaveBeenCalledTimes(1)
    const message = sendMail.mock.calls[0][0]
    expect(message.icalEvent).toEqual(invitation)
    expect(message.html).toContain("Testitapahtuma")
    expect(message.text).toContain("Test event")
    expect(message.html).toContain("update-registration/private-token")
    if (isWaitlisted) {
      expect(message.text).toContain("Olet tällä hetkellä tapahtuman jonossa.")
      expect(message.text).toContain("You're currently on the waiting list.")
      expect(message.text).toContain("when a place becomes available for you.")
      expect(message.text).not.toContain(
        "Successfully registered to the event:"
      )
    } else {
      expect(message.text).toContain("Successfully registered to the event:")
      expect(message.text).not.toContain(
        "You're currently on the waiting list."
      )
    }
  }
)
