import { PoolClient } from "pg"

import {
  asRoot,
  becomeUser,
  createUsers,
  getJobs,
  withAdminUserDb,
  withRootDb,
} from "../../helpers"
import {
  createOrganizationMember,
  createPaidEventData,
  insertPayment,
  register,
} from "../../payments"

/*
 * Organizer actions (mark paid, undo, reminders) and the refunds queued when
 * a paid registration is deleted.
 */

const jobPayloads = async (
  client: PoolClient,
  taskIdentifier: string,
  key: string,
  ids: string[]
) => {
  const jobs = await getJobs(client, taskIdentifier)
  return jobs.map((job) => job.payload).filter((p) => ids.includes(p[key]))
}

const sortById = <T extends Record<string, string>>(rows: T[], key: string) =>
  [...rows].sort((a, b) => a[key].localeCompare(b[key]))

/**
 * The registrations ordered as the database ranks them: those holding a
 * spot first, the queued ones last (ties on created_at are broken by the
 * database, not by creation order).
 */
const byQueueStatus = async <T extends { id: string }>(
  client: PoolClient,
  registrations: T[]
) =>
  asRoot(client, async () => {
    const { rows } = await client.query<{ id: string; status: string }>(
      `select id, status from app_hidden.registrations_status_and_position
        where id = any($1::uuid[])`,
      [registrations.map((r) => r.id)]
    )
    const queued = new Set(
      rows.filter((r) => r.status === "IN_QUEUE").map((r) => r.id)
    )
    return [
      ...registrations.filter((r) => !queued.has(r.id)),
      ...registrations.filter((r) => queued.has(r.id)),
    ]
  })

const paymentsOf = (client: PoolClient, eventId: string) =>
  asRoot(client, async () => {
    const { rows } = await client.query(
      `select * from app_public.payments where event_id = $1 order by created_at`,
      [eventId]
    )
    return rows
  })

describe("admin_mark_registration_paid", () => {
  it("records a manual payment and queues the payment received email", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        priceCents: 1800,
      })
      const { registration } = await register(client, event.id, quota.id)
      await becomeUser(client, admin.id)

      const {
        rows: [payment],
      } = await client.query(
        "select * from app_public.admin_mark_registration_paid($1)",
        [registration.id]
      )
      expect(payment).toMatchObject({
        registration_id: registration.id,
        event_id: event.id,
        quota_id: quota.id,
        event_name: event.name,
        quota_title: quota.title,
        method: "MANUAL",
        status: "PAID",
        ticket_amount_cents: 1800,
        service_fee_cents: 0,
        refunded_amount_cents: 0,
        currency: "eur",
        created_by: admin.id,
      })
      expect(payment.paid_at).toBeTruthy()

      expect(
        await jobPayloads(client, "payment__send_received_email", "paymentId", [
          payment.id,
        ])
      ).toEqual([{ paymentId: payment.id }])

      const { rows } = await client.query(
        `select app_public.registrations_payment_status(r) as status
          from app_public.registrations r where r.id = $1`,
        [registration.id]
      )
      expect(rows[0].status).toBe("PAID_MANUALLY")
    }))

  it("lets members of the event's organization mark registrations paid", () =>
    withRootDb(async (client) => {
      const { organization, event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const member = await createOrganizationMember(client, organization.id)
      await becomeUser(client, member.id)

      const { rows } = await client.query(
        "select method from app_public.admin_mark_registration_paid($1)",
        [registration.id]
      )
      expect(rows).toEqual([{ method: "MANUAL" }])
    }))

  it("refuses an already paid registration", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      await insertPayment(client, registration, { method: "STRIPE" })
      await becomeUser(client, admin.id)

      await expect(
        client.query("select app_public.admin_mark_registration_paid($1)", [
          registration.id,
        ])
      ).rejects.toThrow("already been paid")
    }))

  it.each([
    // [case, quota price, payment mode set after registering]
    ["of a free quota", 0, "DURING_REGISTRATION"],
    ["of an event switched to no payments", 1800, "NONE"],
  ])(
    "refuses a registration %s, which needs no payment",
    (_case, priceCents, paymentModeAfterRegistering) =>
      withAdminUserDb(async (client, admin) => {
        const { event, quota } = await createPaidEventData(client, {
          priceCents,
        })
        const { registration } = await register(client, event.id, quota.id)
        await asRoot(client, () =>
          client.query(
            "update app_public.events set payment_mode = $2 where id = $1",
            [event.id, paymentModeAfterRegistering]
          )
        )
        await becomeUser(client, admin.id)

        await expect(
          client.query("select app_public.admin_mark_registration_paid($1)", [
            registration.id,
          ])
        ).rejects.toThrow("does not require payment")
      })
  )

  it("refuses a queued registration", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        quotaSize: 1,
      })
      const registrations = []
      for (let i = 0; i < 2; i++) {
        const { registration } = await register(client, event.id, quota.id)
        registrations.push(registration)
      }
      const [inSpot, queued] = await byQueueStatus(client, registrations)
      await becomeUser(client, admin.id)

      await client.query("savepoint queued")
      await expect(
        client.query("select app_public.admin_mark_registration_paid($1)", [
          queued.id,
        ])
      ).rejects.toThrow("in the queue")
      await client.query("rollback to savepoint queued")
      const { rows } = await client.query(
        "select method from app_public.admin_mark_registration_paid($1)",
        [inSpot.id]
      )
      expect(rows).toEqual([{ method: "MANUAL" }])
    }))
})

describe("admin_unmark_registration_paid", () => {
  it("removes the manual payment", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      await insertPayment(client, registration, { method: "MANUAL" })
      // An old expired card attempt is left alone
      await insertPayment(client, registration, {
        method: "STRIPE",
        status: "EXPIRED",
      })
      await becomeUser(client, admin.id)

      const { rows } = await client.query(
        "select app_public.admin_unmark_registration_paid($1) as ok",
        [registration.id]
      )
      expect(rows).toEqual([{ ok: true }])

      const payments = await paymentsOf(client, event.id)
      expect(payments.map((p) => [p.method, p.status])).toEqual([
        ["STRIPE", "EXPIRED"],
      ])
    }))

  it("does not undo a card payment", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      await insertPayment(client, registration, { method: "STRIPE" })
      await becomeUser(client, admin.id)

      await expect(
        client.query("select app_public.admin_unmark_registration_paid($1)", [
          registration.id,
        ])
      ).rejects.toThrow("no manual payment")
    }))
})

describe("admin_send_payment_reminders", () => {
  it("queues one reminder per unpaid registration holding a spot", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        quotaSize: 3,
      })
      const registrations = []
      for (let i = 0; i < 4; i++) {
        const { registration } = await register(client, event.id, quota.id)
        registrations.push(registration)
      }
      // Registrations made in one transaction share created_at, so which
      // one is queued is decided by the database: read it back
      const [paid, unpaid1, unpaid2] = await byQueueStatus(
        client,
        registrations
      )
      await insertPayment(client, paid)
      await becomeUser(client, admin.id)

      const { rows } = await client.query(
        "select app_public.admin_send_payment_reminders($1) as count",
        [event.id]
      )
      expect(rows).toEqual([{ count: 2 }])

      const ids = registrations.map((r) => r.id)
      const payloads = await jobPayloads(
        client,
        "payment__send_reminder",
        "registrationId",
        ids
      )
      expect(sortById(payloads, "registrationId")).toEqual(
        sortById(
          [{ registrationId: unpaid1.id }, { registrationId: unpaid2.id }],
          "registrationId"
        )
      )

      const {
        rows: [updated],
      } = await client.query(
        "select last_payment_reminder_sent_at from app_public.events where id = $1",
        [event.id]
      )
      expect(updated.last_payment_reminder_sent_at).toBeTruthy()
    }))

  it("sends nothing and keeps the timestamp empty when nobody is unpaid", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        paymentMode: "NONE",
      })
      const { registration } = await register(client, event.id, quota.id)
      await becomeUser(client, admin.id)

      const { rows } = await client.query(
        "select app_public.admin_send_payment_reminders($1) as count",
        [event.id]
      )
      expect(rows).toEqual([{ count: 0 }])
      expect(
        await jobPayloads(client, "payment__send_reminder", "registrationId", [
          registration.id,
        ])
      ).toEqual([])

      const {
        rows: [updated],
      } = await client.query(
        "select last_payment_reminder_sent_at from app_public.events where id = $1",
        [event.id]
      )
      expect(updated.last_payment_reminder_sent_at).toBeNull()
    }))

  it("refuses to send again within 10 minutes", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      await asRoot(client, () =>
        client.query(
          `update app_public.events
            set last_payment_reminder_sent_at = now() - interval '9 minutes'
            where id = $1`,
          [event.id]
        )
      )
      await becomeUser(client, admin.id)
      await client.query("savepoint cooldown")
      await expect(
        client.query("select app_public.admin_send_payment_reminders($1)", [
          event.id,
        ])
      ).rejects.toThrow("less than 10 minutes ago")
      await client.query("rollback to savepoint cooldown")

      await asRoot(client, () =>
        client.query(
          `update app_public.events
            set last_payment_reminder_sent_at = now() - interval '11 minutes'
            where id = $1`,
          [event.id]
        )
      )
      const { rows } = await client.query(
        "select app_public.admin_send_payment_reminders($1) as count",
        [event.id]
      )
      expect(rows).toEqual([{ count: 1 }])
      expect(
        await jobPayloads(client, "payment__send_reminder", "registrationId", [
          registration.id,
        ])
      ).toEqual([{ registrationId: registration.id }])
    }))
})

describe("organizer action permissions", () => {
  type ArgumentFor = (
    client: PoolClient,
    event: { id: string },
    quota: { id: string }
  ) => Promise<string>

  const registrationId: ArgumentFor = async (client, event, quota) => {
    const { registration } = await register(client, event.id, quota.id)
    return registration.id
  }
  const manuallyPaidRegistrationId: ArgumentFor = async (
    client,
    event,
    quota
  ) => {
    const { registration } = await register(client, event.id, quota.id)
    await insertPayment(client, registration, { method: "MANUAL" })
    return registration.id
  }
  const eventId: ArgumentFor = async (_client, event) => event.id

  it.each([
    ["admin_mark_registration_paid", registrationId],
    ["admin_unmark_registration_paid", manuallyPaidRegistrationId],
    ["admin_send_payment_reminders", eventId],
  ])("%s refuses users without event permissions", (fn, argumentFor) =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const argument = await argumentFor(client, event, quota)
      const [user] = await createUsers(client, 1)
      await becomeUser(client, user.id)

      await expect(
        client.query(`select app_public.${fn}($1)`, [argument])
      ).rejects.toThrow("Access denied")
    })
  )
})

describe("refunds when deleting a registration", () => {
  const refundJobs = (client: PoolClient, paymentIds: string[]) =>
    jobPayloads(client, "payment__refund", "paymentId", paymentIds)

  it.each([
    ["by default", "select app_public.admin_delete_registration($1)"],
    [
      "when refund is null",
      "select app_public.admin_delete_registration($1, null)",
    ],
  ])("admin_delete_registration refunds a card payment %s", (_case, sql) =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const payment = await insertPayment(client, registration)
      await becomeUser(client, admin.id)

      await client.query(sql, [registration.id])

      expect(await refundJobs(client, [payment.id])).toEqual([
        { paymentId: payment.id },
      ])
      // The payment row survives the delete for bookkeeping
      const payments = await paymentsOf(client, event.id)
      expect(payments).toMatchObject([
        { id: payment.id, registration_id: null, status: "PAID" },
      ])
    })
  )

  it("delete_registration always refunds a card payment", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration, updateToken } = await register(
        client,
        event.id,
        quota.id
      )
      const payment = await insertPayment(client, registration)
      await becomeUser(client, null)

      await client.query("select app_public.delete_registration($1)", [
        updateToken,
      ])
      expect(await refundJobs(client, [payment.id])).toEqual([
        { paymentId: payment.id },
      ])
      expect(await paymentsOf(client, event.id)).toMatchObject([
        { id: payment.id, registration_id: null },
      ])
    }))

  it("admin_delete_registration's refund = false covers only that delete", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration: kept } = await register(client, event.id, quota.id)
      const { registration: refunded } = await register(
        client,
        event.id,
        quota.id
      )
      const keptPayment = await insertPayment(client, kept)
      const refundedPayment = await insertPayment(client, refunded)
      await becomeUser(client, admin.id)

      await client.query(
        "select app_public.admin_delete_registration($1, false)",
        [kept.id]
      )
      await client.query("select app_public.admin_delete_registration($1)", [
        refunded.id,
      ])

      expect(
        await refundJobs(client, [keptPayment.id, refundedPayment.id])
      ).toEqual([{ paymentId: refundedPayment.id }])
      // The unrefunded payment row survives the delete too
      expect(await paymentsOf(client, event.id)).toContainEqual(
        expect.objectContaining({
          id: keptPayment.id,
          registration_id: null,
          status: "PAID",
        })
      )
      const {
        rows: [{ setting }],
      } = await client.query(
        "select current_setting('ilmo.refund_deleted_registrations', true) as setting"
      )
      expect(setting).toBe("")
    }))

  it("deleting an event refunds its card payments", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration: card } = await register(client, event.id, quota.id)
      const { registration: manual } = await register(
        client,
        event.id,
        quota.id
      )
      const { registration: pending } = await register(
        client,
        event.id,
        quota.id
      )
      const cardPayment = await insertPayment(client, card)
      const manualPayment = await insertPayment(client, manual, {
        method: "MANUAL",
      })
      const pendingPayment = await insertPayment(client, pending, {
        status: "PENDING",
      })
      const expiredPayment = await insertPayment(client, pending, {
        status: "EXPIRED",
      })
      await becomeUser(client, admin.id)

      // As the deleteEvent CRUD mutation does; registrations cascade
      const { rowCount } = await client.query(
        "delete from app_public.events where id = $1",
        [event.id]
      )
      expect(rowCount).toBe(1)

      expect(
        await refundJobs(client, [
          cardPayment.id,
          manualPayment.id,
          pendingPayment.id,
          expiredPayment.id,
        ])
      ).toEqual([{ paymentId: cardPayment.id }])

      // Every payment row survives for bookkeeping
      const rows = await asRoot(client, async () => {
        const { rows } = await client.query(
          `select id, registration_id, event_id, status from app_public.payments
            where id = any($1)`,
          [[cardPayment.id, manualPayment.id, pendingPayment.id]]
        )
        return rows
      })
      expect(rows).toHaveLength(3)
      for (const row of rows) {
        expect(row).toMatchObject({ registration_id: null, event_id: null })
      }
    }))
})
