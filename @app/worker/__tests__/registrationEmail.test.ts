import { calendarInvitationContributor } from "../src/calendarInvitation"
import {
  buildRegistrationEmail,
  markRegistrationEmailSent,
  registrationEmailContributors,
} from "../src/registrationEmail"
import processQueue from "../src/tasks/registration__process_queue"
import sendConfirmationEmail from "../src/tasks/registration__send_confirmation_email"

import type {
  RegistrationEmailContext,
  RegistrationEmailContributor,
} from "../src/registrationEmail"

function rows() {
  return {
    registration: {
      id: "registration",
      event_id: "event",
      quota_id: "quota",
      email: "tester@example.com",
      first_name: "Test",
      last_name: "User",
    } as any,
    event: {
      id: "event",
      slug: "test-event",
      name: { fi: "Testi", en: "Test" },
      location: "Otaniemi",
      event_start_time: "2026-10-24T15:00:00Z",
      event_end_time: "2026-10-24T19:00:00Z",
    } as any,
    quota: { id: "quota", title: { fi: "Kiintiö", en: "Quota" } } as any,
    registrationSecret: {
      registration_id: "registration",
      update_token: "update-token",
      confirmation_email_sent: false,
      received_spot_from_queue_email_sent: false,
    } as any,
  }
}

type Rows = ReturnType<typeof rows>

function fakeQuery(data: Rows) {
  return jest.fn(async (sql: string, values: any[] = []) => {
    const one = (row: any, key = "id") => ({
      rows: row && row[key] === values[0] ? [row] : [],
    })
    if (sql.startsWith("update")) return { rows: [] }
    if (sql.includes("app_private.registration_secrets"))
      return one(data.registrationSecret, "registration_id")
    if (sql.includes("app_public.registrations")) return one(data.registration)
    if (sql.includes("app_public.events")) return one(data.event)
    if (sql.includes("app_public.quotas")) return one(data.quota)
    throw new Error(`Unexpected query: ${sql}`)
  }) as any
}

const { ROOT_URL } = process.env

const baseVariables = {
  url: ROOT_URL,
  eventName: { fi: "Testi", en: "Test" },
  registrationName: "Test User",
  registrationQuota: { fi: "Kiintiö", en: "Quota" },
  eventTime: expect.stringMatching(/^24\.10\.26 \d\d:00 - 24\.10\.26 \d\d:00$/),
  eventSlug: "test-event",
  eventLocation: "Otaniemi",
  eventRegistrationUpdateLink: "update-registration/update-token",
}

let consoleError: jest.SpyInstance
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  consoleError.mockRestore()
})

it("has one contributor per email block", () => {
  expect(registrationEmailContributors).toEqual([calendarInvitationContributor])
})

describe("buildRegistrationEmail", () => {
  it("builds the confirmation email", async () => {
    const payload = await buildRegistrationEmail(
      fakeQuery(rows()),
      "registration",
      "confirmation",
      []
    )
    expect(payload).toEqual({
      options: {
        to: "tester@example.com",
        subject: "Testi - Rekisteröinti onnnistui",
      },
      template: "event_registration.mjml.njk",
      variables: baseVariables,
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it("builds the spot from queue email", async () => {
    const payload = await buildRegistrationEmail(
      fakeQuery(rows()),
      "registration",
      "spotFromQueue",
      []
    )
    expect(payload).toEqual({
      options: {
        to: "tester@example.com",
        subject: "Testi - Olet saanut paikan jonosta",
      },
      template: "spot_from_queue.mjml.njk",
      variables: baseVariables,
    })
  })

  it("uses the English subject when the event has no Finnish name", async () => {
    const data = rows()
    data.event.name = { en: "Test" }
    const confirmation = await buildRegistrationEmail(
      fakeQuery(data),
      "registration",
      "confirmation",
      []
    )
    const spot = await buildRegistrationEmail(
      fakeQuery(data),
      "registration",
      "spotFromQueue",
      []
    )
    expect(confirmation!.options.subject).toBe("Test - Registration successful")
    expect(spot!.options.subject).toBe(
      "Test - You have received a spot from the queue"
    )
  })

  it("leaves the email unchanged when contributors return {}", async () => {
    const empty: RegistrationEmailContributor = async () => ({})
    const without = await buildRegistrationEmail(
      fakeQuery(rows()),
      "registration",
      "confirmation",
      []
    )
    const withEmpty = await buildRegistrationEmail(
      fakeQuery(rows()),
      "registration",
      "confirmation",
      [empty, empty]
    )
    expect(withEmpty).toEqual(without)
    expect(withEmpty).not.toHaveProperty("attachments")
  })

  it("merges contributions in list order", async () => {
    const seen: RegistrationEmailContext[] = []
    const first: RegistrationEmailContributor = async (ctx) => {
      seen.push(ctx)
      return {
        variables: { block: "first", eventSlug: "overridden" },
        attachments: [{ filename: "a.txt", content: "a" }],
      }
    }
    const second: RegistrationEmailContributor = async () => ({
      variables: { block: "second" },
      attachments: [
        { filename: "b.ics", content: "b", contentType: "text/calendar" },
      ],
    })
    const query = fakeQuery(rows())
    const payload = await buildRegistrationEmail(
      query,
      "registration",
      "spotFromQueue",
      [first, second]
    )
    expect(payload!.variables).toEqual({
      ...baseVariables,
      eventSlug: "overridden",
      block: "second",
    })
    expect(payload!.attachments).toEqual([
      { filename: "a.txt", content: "a" },
      { filename: "b.ics", content: "b", contentType: "text/calendar" },
    ])
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      kind: "spotFromQueue",
      query,
      rootUrl: ROOT_URL,
      registration: { id: "registration" },
      event: { id: "event" },
      quota: { id: "quota" },
      registrationSecret: { update_token: "update-token" },
    })
  })

  it("propagates a contributor error", async () => {
    const failing: RegistrationEmailContributor = async () => {
      throw new Error("boom")
    }
    await expect(
      buildRegistrationEmail(
        fakeQuery(rows()),
        "registration",
        "confirmation",
        [failing]
      )
    ).rejects.toThrow("boom")
  })

  const aborts: Array<
    [string, "confirmation" | "spotFromQueue", (d: Rows) => void, string]
  > = [
    [
      "no registration",
      "confirmation",
      (d) => (d.registration = undefined),
      "Registration not found; aborting",
    ],
    [
      "no event",
      "confirmation",
      (d) => (d.event = undefined),
      "No event found; aborting",
    ],
    [
      "no quota",
      "confirmation",
      (d) => (d.quota = undefined),
      "No quota found; aborting",
    ],
    [
      "no secret",
      "confirmation",
      (d) => (d.registrationSecret = undefined),
      "No registration secrets found; aborting",
    ],
    [
      "already sent",
      "confirmation",
      (d) => (d.registrationSecret.confirmation_email_sent = true),
      "Confirmation email already sent; aborting",
    ],
    [
      "no email",
      "confirmation",
      (d) => (d.registration.email = null),
      "No email specified; aborting",
    ],
    [
      "no event and no secret",
      "confirmation",
      (d) => {
        d.event = undefined
        d.registrationSecret = undefined
      },
      "No event found; aborting",
    ],
    [
      "no secret",
      "spotFromQueue",
      (d) => (d.registrationSecret = undefined),
      "No registration secrets found; aborting",
    ],
    [
      "already sent",
      "spotFromQueue",
      (d) => (d.registrationSecret.received_spot_from_queue_email_sent = true),
      "Received spot from queue email already sent; aborting",
    ],
    [
      "no event",
      "spotFromQueue",
      (d) => (d.event = undefined),
      "Event or quota not found; aborting",
    ],
    [
      "no quota",
      "spotFromQueue",
      (d) => (d.quota = undefined),
      "Event or quota not found; aborting",
    ],
    [
      "no email",
      "spotFromQueue",
      (d) => (d.registration.email = null),
      "No email specified; aborting",
    ],
    [
      "no event and no secret",
      "spotFromQueue",
      (d) => {
        d.event = undefined
        d.registrationSecret = undefined
      },
      "No registration secrets found; aborting",
    ],
  ]

  it.each(aborts)("aborts on %s (%s)", async (_name, kind, mutate, message) => {
    const data = rows()
    mutate(data)
    const contributor = jest.fn(async () => ({}))
    const payload = await buildRegistrationEmail(
      fakeQuery(data),
      "registration",
      kind,
      [contributor]
    )
    expect(payload).toBeNull()
    expect(consoleError.mock.calls).toEqual([[message]])
    expect(contributor).not.toHaveBeenCalled()
  })

  it("ignores the other kind's sent flag", async () => {
    const data = rows()
    data.registrationSecret.received_spot_from_queue_email_sent = true
    expect(
      await buildRegistrationEmail(
        fakeQuery(data),
        "registration",
        "confirmation",
        []
      )
    ).not.toBeNull()
    const other = rows()
    other.registrationSecret.confirmation_email_sent = true
    expect(
      await buildRegistrationEmail(
        fakeQuery(other),
        "registration",
        "spotFromQueue",
        []
      )
    ).not.toBeNull()
  })

  it("fails a spot from queue job whose registration is gone", async () => {
    const data = rows()
    data.registration = undefined
    await expect(
      buildRegistrationEmail(fakeQuery(data), "registration", "spotFromQueue")
    ).rejects.toThrow("Registration not found")
  })
})

describe("markRegistrationEmailSent", () => {
  it.each([
    ["confirmation", "confirmation_email_sent"],
    ["spotFromQueue", "received_spot_from_queue_email_sent"],
  ] as const)("marks the %s email", async (kind, column) => {
    const query = jest.fn(async () => ({ rows: [] }))
    await markRegistrationEmailSent(query as any, "registration", kind)
    expect(query).toHaveBeenCalledWith(
      `update app_private.registration_secrets set ${column} = true where registration_id = $1`,
      ["registration"]
    )
  })
})

describe("tasks", () => {
  it.each([
    [
      "registration__send_confirmation_email",
      sendConfirmationEmail,
      { id: "registration" },
      "event_registration.mjml.njk",
      "confirmation_email_sent",
    ],
    [
      "registration__process_queue",
      processQueue,
      {
        receivedSpot: {
          id: "registration",
          status: "IN_QUOTA",
          position: 1,
          event_id: "event",
          quota_id: "quota",
        },
      },
      "spot_from_queue.mjml.njk",
      "received_spot_from_queue_email_sent",
    ],
  ])(
    "%s queues send_email and then marks it sent",
    async (_name, task, payload, template, column) => {
      const query = fakeQuery(rows())
      const addJob = jest.fn(async () => ({}))
      await task(payload, { query, addJob } as any)
      expect(addJob).toHaveBeenCalledTimes(1)
      expect(addJob).toHaveBeenCalledWith(
        "send_email",
        expect.objectContaining({ template })
      )
      const update = query.mock.calls.find(([sql]: [string]) =>
        sql.startsWith("update")
      )
      expect(update).toEqual([
        `update app_private.registration_secrets set ${column} = true where registration_id = $1`,
        ["registration"],
      ])
      expect(addJob.mock.invocationCallOrder[0]).toBeLessThan(
        query.mock.invocationCallOrder[query.mock.calls.indexOf(update)]
      )
    }
  )

  it("queues nothing when the email was already sent", async () => {
    const data = rows()
    data.registrationSecret.confirmation_email_sent = true
    const query = fakeQuery(data)
    const addJob = jest.fn()
    await sendConfirmationEmail({ id: "registration" }, {
      query,
      addJob,
    } as any)
    expect(addJob).not.toHaveBeenCalled()
    expect(
      query.mock.calls.some(([sql]: [string]) => sql.startsWith("update"))
    ).toBe(false)
  })
})
