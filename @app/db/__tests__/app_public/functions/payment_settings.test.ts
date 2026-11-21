import { PoolClient } from "pg"

import {
  asRoot,
  becomeUser,
  poolFromUrl,
  resetFeatureFlags,
  setFeatureFlag,
  TEST_DATABASE_URL,
  withAdminUserDb,
} from "../../helpers"
import { createPaidEventData, insertPayment, register } from "../../payments"

// The payments flag is on (and available) for this file; what the database
// refuses while it is off is tested in payments_flag_off.test.ts
beforeAll(async () => {
  const pool = poolFromUrl(TEST_DATABASE_URL)
  await resetFeatureFlags(pool)
  await setFeatureFlag(pool, "payments", "on")
})
afterAll(() => resetFeatureFlags(poolFromUrl(TEST_DATABASE_URL)))

/*
 * Quota prices, what changing them does to payments made already, and the
 * close email timestamp that reopening registration clears.
 */

const quotaInput = (quota: any, overrides: Record<string, unknown> = {}) => ({
  id: quota.id,
  position: quota.position,
  title: quota.title,
  size: quota.size,
  ...overrides,
})

/** Calls update_event like the admin UI does, as the current user. */
const updateEvent = (
  client: PoolClient,
  eventId: string,
  event: Record<string, unknown>,
  quotas: Record<string, unknown>[]
) =>
  client.query(
    `select * from app_public.update_event(
      $1,
      jsonb_populate_record(null::app_public.event_input, $2::jsonb),
      array(
        select jsonb_populate_record(null::app_public.update_event_quotas, q)
        from jsonb_array_elements($3::jsonb) as q
      ),
      '{}'
    )`,
    [eventId, JSON.stringify(event), JSON.stringify(quotas)]
  )

/** Calls create_event like the admin UI does, as the current user. */
const createEvent = async (
  client: PoolClient,
  organizationId: string,
  categoryId: string,
  event: Record<string, unknown>,
  quotas: Record<string, unknown>[]
) => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const {
    rows: [created],
  } = await client.query(
    `select * from app_public.create_event(
      jsonb_populate_record(null::app_public.event_input, $1::jsonb),
      array(
        select jsonb_populate_record(null::app_public.create_event_quotas, q)
        from jsonb_array_elements($2::jsonb) as q
      ),
      '{}'
    )`,
    [
      JSON.stringify({
        slug: `payments-${now}-${Math.random()}`,
        name: { fi: "Maksullinen", en: "Paid" },
        description: { fi: "", en: "" },
        location: "Otaniemi",
        registration_start_time: new Date(now - day),
        registration_end_time: new Date(now + day),
        event_start_time: new Date(now + 2 * day),
        event_end_time: new Date(now + 3 * day),
        is_highlighted: false,
        is_draft: false,
        open_quota_size: 0,
        owner_organization_id: organizationId,
        category_id: categoryId,
        ...event,
      }),
      JSON.stringify(quotas),
    ]
  )
  const { rows: createdQuotas } = await client.query(
    "select price_cents from app_public.quotas where event_id = $1 order by position",
    [created.id]
  )
  return { event: created, quotas: createdQuotas }
}

const newQuota = (position: number, extra: Record<string, unknown> = {}) => ({
  position,
  title: { fi: `Kiintiö ${position}`, en: `Quota ${position}` },
  size: 10,
  ...extra,
})

const paymentStatus = async (client: PoolClient, registrationId: string) => {
  const { rows } = await asRoot(client, () =>
    client.query(
      `select app_private.registration_payment_status(r) as status
        from app_public.registrations r where r.id = $1`,
      [registrationId]
    )
  )
  return rows[0].status
}

describe("create_event quota prices", () => {
  it("writes the quota prices", () =>
    withAdminUserDb(async (client, admin) => {
      const { organization, eventCategory } = await createPaidEventData(client)
      await becomeUser(client, admin.id)
      const { quotas } = await createEvent(
        client,
        organization.id,
        eventCategory.id,
        {},
        [newQuota(0, { price_cents: 1800 }), newQuota(1, { price_cents: 0 })]
      )
      expect(quotas).toEqual([{ price_cents: 1800 }, { price_cents: 0 }])
    }))
})

describe("update_event quota prices", () => {
  it("updates quota prices", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        priceCents: 0,
      })
      await becomeUser(client, admin.id)
      await updateEvent(client, event.id, {}, [
        quotaInput(quota, { price_cents: 1000 }),
      ])

      const { rows } = await client.query(
        "select price_cents from app_public.quotas where id = $1",
        [quota.id]
      )
      expect(rows).toEqual([{ price_cents: 1000 }])
    }))

  it("keeps prices when the field is left out, and adds new quotas as free unless a price is given", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        priceCents: 1800,
      })
      await becomeUser(client, admin.id)
      const {
        rows: [updated],
      } = await updateEvent(client, event.id, { location: "Dipoli" }, [
        quotaInput(quota),
        {
          position: 1,
          title: { fi: "Ilmainen", en: "Free" },
          size: 5,
        },
        {
          position: 2,
          title: { fi: "Maksullinen", en: "Paid" },
          size: 5,
          price_cents: 25,
        },
      ])
      expect(updated.location).toBe("Dipoli")

      const { rows } = await client.query(
        "select price_cents from app_public.quotas where event_id = $1 order by position",
        [event.id]
      )
      expect(rows).toEqual([
        { price_cents: 1800 },
        { price_cents: 0 },
        { price_cents: 25 },
      ])
    }))

  it("allows changing a price after payments; paid registrations stay paid and unpaid ones owe the new price", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        priceCents: 1800,
      })
      const { registration: paid } = await register(client, event.id, quota.id)
      const { registration: unpaid } = await register(
        client,
        event.id,
        quota.id
      )
      await insertPayment(client, paid, { ticketAmountCents: 1800 })

      await becomeUser(client, admin.id)
      for (const priceCents of [2200, 0]) {
        await updateEvent(client, event.id, {}, [
          quotaInput(quota, { price_cents: priceCents }),
        ])
        expect(await paymentStatus(client, paid.id)).toBe("PAID")
      }
      expect(await paymentStatus(client, unpaid.id)).toBe("NOT_REQUIRED")

      await updateEvent(client, event.id, {}, [
        quotaInput(quota, { price_cents: 2500 }),
      ])
      expect(await paymentStatus(client, unpaid.id)).toBe("UNPAID")
      // What was paid is kept on the payment
      const { rows } = await asRoot(client, () =>
        client.query(
          "select ticket_amount_cents from app_public.payments where registration_id = $1",
          [paid.id]
        )
      )
      expect(rows).toEqual([{ ticket_amount_cents: 1800 }])
    }))
})

describe("unpaid_close_email_sent_at", () => {
  const closeEmailSentAt = async (client: PoolClient, eventId: string) => {
    const { rows } = await asRoot(client, () =>
      client.query(
        "select unpaid_close_email_sent_at from app_public.events where id = $1",
        [eventId]
      )
    )
    return rows[0].unpaid_close_email_sent_at
  }

  const hour = 60 * 60 * 1000
  // The fake event starts a random time after registration closes, so moving
  // the close later goes only halfway to the start to keep it before it
  const halfwayToStart = (end: number, start: number) => (start - end) / 2
  it.each([
    [
      "is cleared when registration_end_time moves later",
      halfwayToStart,
      false,
    ],
    ["is kept when registration_end_time moves earlier", () => -hour, true],
    ["is kept when registration_end_time is unchanged", () => 0, true],
  ])("%s", (_case, shift, kept) =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      await asRoot(client, () =>
        client.query(
          "update app_public.events set unpaid_close_email_sent_at = now() where id = $1",
          [event.id]
        )
      )
      const end = new Date(event.registration_end_time).getTime()
      const start = new Date(event.event_start_time).getTime()
      const newEnd = new Date(end + shift(end, start))
      await becomeUser(client, admin.id)
      await updateEvent(
        client,
        event.id,
        { location: "Dipoli", registration_end_time: newEnd },
        [quotaInput(quota)]
      )
      expect(!!(await closeEmailSentAt(client, event.id))).toBe(kept)
    })
  )
})
