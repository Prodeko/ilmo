import { PoolClient } from "pg"

import {
  asRoot,
  becomeUser,
  createUsers,
  getJobs,
  poolFromUrl,
  TEST_DATABASE_URL,
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

  it("refuses users without event permissions", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const [user] = await createUsers(client, 1)
      await becomeUser(client, user.id)

      await expect(
        client.query("select app_public.admin_mark_registration_paid($1)", [
          registration.id,
        ])
      ).rejects.toThrow("Access denied")
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

  it("refuses a registration that needs no payment", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        priceCents: 0,
      })
      const { registration } = await register(client, event.id, quota.id)
      await becomeUser(client, admin.id)

      await expect(
        client.query("select app_public.admin_mark_registration_paid($1)", [
          registration.id,
        ])
      ).rejects.toThrow("does not require payment")
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

  it("refuses users without event permissions", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      await insertPayment(client, registration, { method: "MANUAL" })
      const [user] = await createUsers(client, 1)
      await becomeUser(client, user.id)

      await expect(
        client.query("select app_public.admin_unmark_registration_paid($1)", [
          registration.id,
        ])
      ).rejects.toThrow("Access denied")
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
      const [paid, unpaid1, unpaid2, queued] = registrations
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
      expect(payloads).toEqual([
        { registrationId: unpaid1.id },
        { registrationId: unpaid2.id },
      ])
      expect(ids).toContain(queued.id)

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

  it("refuses users without event permissions", () =>
    withRootDb(async (client) => {
      const { event } = await createPaidEventData(client)
      const [user] = await createUsers(client, 1)
      await becomeUser(client, user.id)
      await expect(
        client.query("select app_public.admin_send_payment_reminders($1)", [
          event.id,
        ])
      ).rejects.toThrow("Access denied")
    }))
})

describe("refunds when deleting a registration", () => {
  const refundJobs = (client: PoolClient, paymentIds: string[]) =>
    jobPayloads(client, "payment__refund", "paymentId", paymentIds)

  it("admin_delete_registration refunds a card payment by default", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const payment = await insertPayment(client, registration)
      await becomeUser(client, admin.id)

      await client.query("select app_public.admin_delete_registration($1)", [
        registration.id,
      ])

      expect(await refundJobs(client, [payment.id])).toEqual([
        { paymentId: payment.id },
      ])
      // The payment row survives the delete for bookkeeping
      const payments = await paymentsOf(client, event.id)
      expect(payments).toMatchObject([
        { id: payment.id, registration_id: null, status: "PAID" },
      ])
    }))

  it("admin_delete_registration treats a null refund as the default", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const payment = await insertPayment(client, registration)
      await becomeUser(client, admin.id)

      await client.query(
        "select app_public.admin_delete_registration($1, null)",
        [registration.id]
      )
      expect(await refundJobs(client, [payment.id])).toHaveLength(1)
    }))

  it("admin_delete_registration does not refund when refund is false", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const payment = await insertPayment(client, registration)
      await becomeUser(client, admin.id)

      await client.query(
        "select app_public.admin_delete_registration($1, false)",
        [registration.id]
      )
      expect(await refundJobs(client, [payment.id])).toEqual([])
      expect(await paymentsOf(client, event.id)).toMatchObject([
        { id: payment.id, registration_id: null, status: "PAID" },
      ])
    }))

  it("admin_delete_registration never refunds a manual payment", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const payment = await insertPayment(client, registration, {
        method: "MANUAL",
      })
      await becomeUser(client, admin.id)

      await client.query(
        "select app_public.admin_delete_registration($1, true)",
        [registration.id]
      )
      expect(await refundJobs(client, [payment.id])).toEqual([])
    }))

  it("admin_delete_registration ignores payments that were not completed", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const pending = await insertPayment(client, registration, {
        status: "PENDING",
      })
      const expired = await insertPayment(client, registration, {
        status: "EXPIRED",
      })
      await becomeUser(client, admin.id)

      await client.query("select app_public.admin_delete_registration($1)", [
        registration.id,
      ])
      expect(await refundJobs(client, [pending.id, expired.id])).toEqual([])
    }))

  it("admin_delete_registration still deletes unpaid registrations", () =>
    withAdminUserDb(async (client, admin) => {
      const { event, quota } = await createPaidEventData(client, {
        paymentMode: "NONE",
      })
      const { registration } = await register(client, event.id, quota.id)
      await becomeUser(client, admin.id)

      const { rows } = await client.query(
        "select app_public.admin_delete_registration($1) as ok",
        [registration.id]
      )
      expect(rows).toEqual([{ ok: true }])
      const { rows: left } = await client.query(
        "select id from app_public.registrations where id = $1",
        [registration.id]
      )
      expect(left).toEqual([])
    }))

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

  it("delete_registration never refunds a manual payment", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration, updateToken } = await register(
        client,
        event.id,
        quota.id
      )
      const payment = await insertPayment(client, registration, {
        method: "MANUAL",
      })
      await becomeUser(client, null)

      await client.query("select app_public.delete_registration($1)", [
        updateToken,
      ])
      expect(await refundJobs(client, [payment.id])).toEqual([])
    }))

  it("delete_registration refunds only once when called twice", () =>
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
      await client.query("savepoint second_delete")
      await expect(
        client.query("select app_public.delete_registration($1)", [updateToken])
      ).rejects.toThrow("Registration matching token was not found.")
      await client.query("rollback to savepoint second_delete")
      expect(await refundJobs(client, [payment.id])).toHaveLength(1)
    }))

  it("delete_registration serializes concurrent calls with the same token", async () => {
    // Needs committed data, so this test cleans up after itself
    const pool = poolFromUrl(TEST_DATABASE_URL)
    const setup = await pool.connect()
    const first = await pool.connect()
    const second = await pool.connect()
    let data:
      | { eventId: string; organizationId: string; paymentId: string }
      | undefined
    try {
      await setup.query("begin")
      const { event, quota, organization } = await createPaidEventData(setup)
      const { registration, updateToken } = await register(
        setup,
        event.id,
        quota.id
      )
      const payment = await insertPayment(setup, registration)
      await setup.query("commit")
      data = {
        eventId: event.id,
        organizationId: organization.id,
        paymentId: payment.id,
      }

      await first.query("begin")
      await second.query("begin")
      await first.query("select app_public.delete_registration($1)", [
        updateToken,
      ])
      // Blocks on the registration row lock until the first call commits
      const secondCall = second
        .query("select app_public.delete_registration($1)", [updateToken])
        .then(
          () => null,
          (e: Error) => e
        )
      await new Promise((resolve) => setTimeout(resolve, 200))
      await first.query("commit")
      const error = await secondCall
      await second.query("rollback")

      expect(error?.message).toBe("Registration matching token was not found.")
      const { rows } = await setup.query(
        `select count(*)::int as count from graphile_worker._private_jobs
          where payload->>'paymentId' = $1`,
        [payment.id]
      )
      expect(rows).toEqual([{ count: 1 }])
    } finally {
      await first.query("rollback").catch(() => {})
      await second.query("rollback").catch(() => {})
      if (data) {
        await setup.query(
          "delete from graphile_worker._private_jobs where payload->>'paymentId' = $1",
          [data.paymentId]
        )
        await setup.query("delete from app_public.payments where id = $1", [
          data.paymentId,
        ])
        await setup.query("delete from app_public.events where id = $1", [
          data.eventId,
        ])
        await setup.query(
          "delete from app_public.event_categories where owner_organization_id = $1",
          [data.organizationId]
        )
        await setup.query(
          "delete from app_public.organizations where id = $1",
          [data.organizationId]
        )
      }
      setup.release()
      first.release()
      second.release()
    }
  })

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

  it("skips refunds while ilmo.refund_deleted_registrations is off", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const payment = await insertPayment(client, registration)

      await client.query(
        "select set_config('ilmo.refund_deleted_registrations', 'off', true)"
      )
      await client.query("delete from app_public.events where id = $1", [
        event.id,
      ])
      expect(await refundJobs(client, [payment.id])).toEqual([])
    }))
})
