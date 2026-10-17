import { PoolClient } from "pg"

import {
  asRoot,
  becomeUser,
  createUsers,
  withAdminUserDb,
  withRootDb,
} from "../../helpers"
import { createPaidEventData, register } from "../../payments"

/*
 * Payment settings on events and quotas, and the price snapshot that
 * registrations take of their quota price.
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

const getPrices = async (client: PoolClient, ids: string[]) => {
  const { rows } = await asRoot(client, () =>
    client.query(
      "select id, price_cents from app_public.registrations where id = any($1)",
      [ids]
    )
  )
  return Object.fromEntries(rows.map((r) => [r.id, r.price_cents]))
}

describe("create_registration price snapshot", () => {
  it("snapshots the quota price for a paid event", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client, {
        priceCents: 1800,
      })
      const { registration } = await register(client, event.id, quota.id)
      expect(registration.price_cents).toBe(1800)
    }))

  it("keeps the snapshot when the quota price changes later", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        priceCents: 1800,
      })
      const { registration } = await register(client, event.id, quota.id)

      await becomeUser(client, admin.id)
      await updateEvent(client, event.id, {}, [
        quotaInput(quota, { price_cents: 2200 }),
      ])
      const { registration: later } = await register(client, event.id, quota.id)

      expect(await getPrices(client, [registration.id, later.id])).toEqual({
        [registration.id]: 1800,
        [later.id]: 2200,
      })
    }))

  it("sets no price when the event has no payments", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client, {
        paymentMode: "NONE",
        priceCents: 1800,
      })
      const { registration } = await register(client, event.id, quota.id)
      expect(registration.price_cents).toBeNull()
    }))

  it("sets no price for a free quota", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client, {
        priceCents: 0,
      })
      const { registration } = await register(client, event.id, quota.id)
      expect(registration.price_cents).toBeNull()
    }))

  it("sets no price on an unfinished registration", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const {
        rows: [tokens],
      } = await client.query(
        "select * from app_public.claim_registration_token($1, $2)",
        [event.id, quota.id]
      )
      const { rows } = await client.query(
        `select r.price_cents from app_public.registrations r
          join app_private.registration_secrets s on s.registration_id = r.id
          where s.registration_token = $1`,
        [tokens.registration_token]
      )
      expect(rows).toEqual([{ price_cents: null }])
    }))

  it("queues exactly one confirmation email", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const { rows } = await client.query(
        `select count(*)::int as count
          from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = 'registration__send_confirmation_email'
          and j.payload->>'id' = $1`,
        [registration.id]
      )
      expect(rows[0].count).toBe(1)
    }))
})

describe("create_event payment settings", () => {
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

  const quota = (position: number, extra: Record<string, unknown> = {}) => ({
    position,
    title: { fi: `Kiintiö ${position}`, en: `Quota ${position}` },
    size: 10,
    ...extra,
  })

  it("writes the payment mode, close email setting and quota prices", () =>
    withAdminUserDb(async (client, admin) => {
      const { organization, eventCategory } = await createPaidEventData(client)
      await becomeUser(client, admin.id)
      const { event, quotas } = await createEvent(
        client,
        organization.id,
        eventCategory.id,
        {
          payment_mode: "DURING_REGISTRATION",
          send_unpaid_email_on_close: true,
        },
        [quota(0, { price_cents: 1800 }), quota(1, { price_cents: 0 })]
      )
      expect(event.payment_mode).toBe("DURING_REGISTRATION")
      expect(event.send_unpaid_email_on_close).toBe(true)
      expect(quotas).toEqual([{ price_cents: 1800 }, { price_cents: 0 }])
    }))

  it("defaults to no payments and free quotas when the fields are left out", () =>
    withAdminUserDb(async (client, admin) => {
      const { organization, eventCategory } = await createPaidEventData(client)
      await becomeUser(client, admin.id)
      const { event, quotas } = await createEvent(
        client,
        organization.id,
        eventCategory.id,
        {},
        [quota(0)]
      )
      expect(event.payment_mode).toBe("NONE")
      expect(event.send_unpaid_email_on_close).toBe(false)
      expect(quotas).toEqual([{ price_cents: 0 }])
    }))

  it("always turns the close email on in AFTER_REGISTRATION mode", () =>
    withAdminUserDb(async (client, admin) => {
      const { organization, eventCategory } = await createPaidEventData(client)
      await becomeUser(client, admin.id)
      const { event } = await createEvent(
        client,
        organization.id,
        eventCategory.id,
        {
          payment_mode: "AFTER_REGISTRATION",
          send_unpaid_email_on_close: false,
        },
        [quota(0, { price_cents: 500 })]
      )
      expect(event.send_unpaid_email_on_close).toBe(true)
    }))

  it("rejects an invalid quota price", () =>
    withAdminUserDb(async (client, admin) => {
      const { organization, eventCategory } = await createPaidEventData(client)
      await becomeUser(client, admin.id)
      await expect(
        createEvent(
          client,
          organization.id,
          eventCategory.id,
          { payment_mode: "DURING_REGISTRATION" },
          [quota(0, { price_cents: 10 })]
        )
      ).rejects.toThrow("quotas_price_cents_check")
    }))
})

describe("update_event payment settings", () => {
  it("updates the payment mode, close email setting and quota prices", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        paymentMode: "NONE",
        priceCents: 0,
      })
      await becomeUser(client, admin.id)
      const {
        rows: [updated],
      } = await updateEvent(
        client,
        event.id,
        {
          payment_mode: "DURING_REGISTRATION",
          send_unpaid_email_on_close: true,
        },
        [quotaInput(quota, { price_cents: 1000 })]
      )
      expect(updated.payment_mode).toBe("DURING_REGISTRATION")
      expect(updated.send_unpaid_email_on_close).toBe(true)

      const { rows } = await client.query(
        "select price_cents from app_public.quotas where id = $1",
        [quota.id]
      )
      expect(rows).toEqual([{ price_cents: 1000 }])
    }))

  it("keeps payment settings and prices when the fields are left out", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        paymentMode: "DURING_REGISTRATION",
        priceCents: 1800,
      })
      await asRoot(client, () =>
        client.query(
          "update app_public.events set send_unpaid_email_on_close = true where id = $1",
          [event.id]
        )
      )
      await becomeUser(client, admin.id)
      const {
        rows: [updated],
      } = await updateEvent(client, event.id, { location: "Dipoli" }, [
        quotaInput(quota),
      ])
      expect(updated.location).toBe("Dipoli")
      expect(updated.payment_mode).toBe("DURING_REGISTRATION")
      expect(updated.send_unpaid_email_on_close).toBe(true)

      const { rows } = await client.query(
        "select price_cents from app_public.quotas where id = $1",
        [quota.id]
      )
      expect(rows).toEqual([{ price_cents: 1800 }])
    }))

  it("adds new quotas as free unless a price is given", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      await becomeUser(client, admin.id)
      await updateEvent(client, event.id, {}, [
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

  it("always turns the close email on in AFTER_REGISTRATION mode", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        paymentMode: "NONE",
      })
      await becomeUser(client, admin.id)
      const {
        rows: [updated],
      } = await updateEvent(
        client,
        event.id,
        {
          payment_mode: "AFTER_REGISTRATION",
          send_unpaid_email_on_close: false,
        },
        [quotaInput(quota)]
      )
      expect(updated.send_unpaid_email_on_close).toBe(true)
    }))

  it("backfills prices when switching from no payments to a paid mode", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        paymentMode: "NONE",
        priceCents: 0,
      })
      const { freeQuota } = await asRoot(client, async () => {
        const {
          rows: [freeQuota],
        } = await client.query(
          `insert into app_public.quotas(event_id, position, title, size)
            values ($1, 1, '{"fi": "Ilmainen", "en": "Free"}', 10) returning *`,
          [event.id]
        )
        return { freeQuota }
      })
      const { registration: paidOne } = await register(
        client,
        event.id,
        quota.id
      )
      const { registration: freeOne } = await register(
        client,
        event.id,
        freeQuota.id
      )
      const unfinishedId = await asRoot(client, async () => {
        const { rows: unfinished } = await client.query(
          "select * from app_public.claim_registration_token($1, $2)",
          [event.id, quota.id]
        )
        const { rows } = await client.query(
          "select registration_id from app_private.registration_secrets where registration_token = $1",
          [unfinished[0].registration_token]
        )
        return rows[0].registration_id as string
      })
      expect(
        await getPrices(client, [paidOne.id, freeOne.id, unfinishedId])
      ).toEqual({
        [paidOne.id]: null,
        [freeOne.id]: null,
        [unfinishedId]: null,
      })

      // Switch to a paid mode and set the price in the same save
      await becomeUser(client, admin.id)
      await updateEvent(
        client,
        event.id,
        { payment_mode: "DURING_REGISTRATION" },
        [
          quotaInput(quota, { price_cents: 1500 }),
          quotaInput(freeQuota, { price_cents: 0 }),
        ]
      )

      expect(
        await getPrices(client, [paidOne.id, freeOne.id, unfinishedId])
      ).toEqual({
        [paidOne.id]: 1500,
        [freeOne.id]: null,
        [unfinishedId]: null,
      })
    }))

  it("does not touch existing snapshots when switching between paid modes", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        paymentMode: "DURING_REGISTRATION",
        priceCents: 1800,
      })
      const { registration } = await register(client, event.id, quota.id)
      // A registration made before the price existed has no snapshot
      const { registration: free } = await asRoot(client, async () => {
        await client.query(
          "update app_public.quotas set price_cents = 0 where id = $1",
          [quota.id]
        )
        const result = await register(client, event.id, quota.id)
        await client.query(
          "update app_public.quotas set price_cents = 1800 where id = $1",
          [quota.id]
        )
        return result
      })

      await becomeUser(client, admin.id)
      await updateEvent(
        client,
        event.id,
        { payment_mode: "AFTER_REGISTRATION" },
        [quotaInput(quota, { price_cents: 2500 })]
      )

      expect(await getPrices(client, [registration.id, free.id])).toEqual({
        [registration.id]: 1800,
        [free.id]: null,
      })
    }))

  it("does not let visitors call the backfill for an event they cannot manage", () =>
    withRootDb(async (client) => {
      const { event } = await createPaidEventData(client)
      const [user] = await createUsers(client, 1)
      await becomeUser(client, user.id)
      await expect(
        client.query("select app_hidden.backfill_registration_prices($1)", [
          event.id,
        ])
      ).rejects.toThrow("Access denied")
    }))
})
