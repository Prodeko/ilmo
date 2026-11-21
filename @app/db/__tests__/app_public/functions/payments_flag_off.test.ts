import { PoolClient } from "pg"

import {
  asRoot,
  becomeUser,
  upsertFeatureFlag,
  withAdminUserDb,
} from "../../helpers"
import { createPaidEventData, insertPayment, register } from "../../payments"

/*
 * While the `payments` flag is off nobody can start a payment: quota prices
 * are refused (errcode FTOFF) and the organizer payment actions refuse to
 * run. What is already there stays: stored prices are kept, paid
 * registrations stay paid.
 */

const day = 24 * 60 * 60 * 1000

const eventInput = (
  organizationId: string,
  categoryId: string,
  extra: Record<string, unknown> = {}
) => {
  const now = Date.now()
  return {
    slug: `payments-off-${now}-${Math.random()}`,
    name: { fi: "Tapahtuma", en: "Event" },
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
    ...extra,
  }
}

const newQuota = (extra: Record<string, unknown> = {}) => ({
  position: 0,
  title: { fi: "Kiintiö", en: "Quota" },
  size: 10,
  ...extra,
})

const createEvent = (
  client: PoolClient,
  event: Record<string, unknown>,
  quotas: Record<string, unknown>[]
) =>
  client.query(
    `select * from app_public.create_event(
      jsonb_populate_record(null::app_public.event_input, $1::jsonb),
      array(
        select jsonb_populate_record(null::app_public.create_event_quotas, q)
        from jsonb_array_elements($2::jsonb) as q
      ),
      '{}'
    )`,
    [JSON.stringify(event), JSON.stringify(quotas)]
  )

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

const quotaInput = (quota: any, extra: Record<string, unknown> = {}) => ({
  id: quota.id,
  position: quota.position,
  title: quota.title,
  size: quota.size,
  ...extra,
})

/** A paid event made while payments were on, with the flag now off. */
async function paidEventWithFlagOff(client: PoolClient, userId: string) {
  const data = await createPaidEventData(client)
  await upsertFeatureFlag(client, "payments", "off")
  await becomeUser(client, userId)
  return data
}

describe("while the payments flag is off", () => {
  describe("create_event", () => {
    it("refuses a quota price", () =>
      withAdminUserDb(async (client, admin) => {
        const { organization, eventCategory } = await paidEventWithFlagOff(
          client,
          admin.id
        )
        await expect(
          createEvent(client, eventInput(organization.id, eventCategory.id), [
            newQuota({ price_cents: 1800 }),
          ])
        ).rejects.toMatchObject({ code: "FTOFF" })
      }))

    it("accepts free quotas", () =>
      withAdminUserDb(async (client, admin) => {
        const { organization, eventCategory } = await paidEventWithFlagOff(
          client,
          admin.id
        )
        const {
          rows: [event],
        } = await createEvent(
          client,
          eventInput(organization.id, eventCategory.id),
          [newQuota({ price_cents: 0 }), newQuota({ position: 1 })]
        )
        const { rows } = await client.query(
          "select price_cents from app_public.quotas where event_id = $1",
          [event.id]
        )
        expect(rows).toEqual([{ price_cents: 0 }, { price_cents: 0 }])
      }))
  })

  describe("update_event", () => {
    it("refuses a non-zero quota price, also the stored one", () =>
      withAdminUserDb(async (client, admin) => {
        const { event, quota } = await paidEventWithFlagOff(client, admin.id)
        await expect(
          updateEvent(client, event.id, {}, [
            quotaInput(quota, { price_cents: quota.price_cents }),
          ])
        ).rejects.toMatchObject({ code: "FTOFF" })
      }))

    it("keeps the stored prices when they are left out", () =>
      withAdminUserDb(async (client, admin) => {
        const { event, quota } = await paidEventWithFlagOff(client, admin.id)
        const {
          rows: [updated],
        } = await updateEvent(client, event.id, { location: "Espoo" }, [
          quotaInput(quota),
        ])
        expect(updated).toMatchObject({ location: "Espoo" })
        const {
          rows: [stored],
        } = await client.query(
          "select price_cents from app_public.quotas where id = $1",
          [quota.id]
        )
        expect(stored.price_cents).toBe(1800)
      }))

    it("lets an organizer make a paid quota free", () =>
      withAdminUserDb(async (client, admin) => {
        const { event, quota } = await paidEventWithFlagOff(client, admin.id)
        await updateEvent(client, event.id, {}, [
          quotaInput(quota, { price_cents: 0 }),
        ])
        const { rows } = await client.query(
          "select price_cents from app_public.quotas where id = $1",
          [quota.id]
        )
        expect(rows).toEqual([{ price_cents: 0 }])
      }))
  })

  describe("organizer payment actions", () => {
    it("refuses admin_mark_registration_paid and admin_unmark_registration_paid", () =>
      withAdminUserDb(async (client, admin) => {
        const { event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        await upsertFeatureFlag(client, "payments", "off")
        await becomeUser(client, admin.id)
        for (const fn of [
          "admin_mark_registration_paid",
          "admin_unmark_registration_paid",
        ]) {
          await client.query("savepoint flag_off")
          await expect(
            client.query(`select app_public.${fn}($1)`, [registration.id])
          ).rejects.toMatchObject({ code: "FTOFF" })
          await client.query("rollback to savepoint flag_off")
        }
      }))

    it("refuses admin_send_payment_reminders", () =>
      withAdminUserDb(async (client, admin) => {
        const { event } = await paidEventWithFlagOff(client, admin.id)
        await expect(
          client.query("select app_public.admin_send_payment_reminders($1)", [
            event.id,
          ])
        ).rejects.toMatchObject({ code: "FTOFF" })
      }))
  })

  it("keeps showing a card payment as paid, also after its registration is deleted", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const { registration: deleted } = await register(
        client,
        event.id,
        quota.id
      )
      await insertPayment(client, registration)
      const detached = await insertPayment(client, deleted)
      await upsertFeatureFlag(client, "payments", "off")
      await becomeUser(client, admin.id)

      const {
        rows: [{ status }],
      } = await client.query(
        `select app_public.registrations_payment_status(r) as status
          from app_public.registrations r where r.id = $1`,
        [registration.id]
      )
      expect(status).toBe("PAID")

      await client.query("select app_public.admin_delete_registration($1)", [
        deleted.id,
      ])
      const { rows } = await asRoot(client, () =>
        client.query(
          "select registration_id, status from app_public.payments where id = $1",
          [detached.id]
        )
      )
      expect(rows).toEqual([{ registration_id: null, status: "PAID" }])
    }))
})
