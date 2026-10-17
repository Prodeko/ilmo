import dayjs from "dayjs"

import {
  asRoot,
  becomeUser,
  clearJobs,
  createUsers,
  getJobs,
  runJobs,
  withAdminUserDb,
  withRootDb,
} from "../../helpers"
import {
  createOrganizationMember,
  createPaidEventData,
  insertPayment,
  register,
} from "../../payments"

describe("app_public.payments", () => {
  describe("row level security", () => {
    it("hides payments from anonymous users", () =>
      withRootDb(async (client) => {
        const { event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        await insertPayment(client, registration)

        await becomeUser(client, null)
        const { rows } = await client.query(
          "select * from app_public.payments where event_id = $1",
          [event.id]
        )
        expect(rows).toEqual([])
      }))

    it("hides payments from logged in users without event permissions", () =>
      withRootDb(async (client) => {
        const { event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        await insertPayment(client, registration)
        const [user] = await createUsers(client, 1)

        await becomeUser(client, user.id)
        const { rows } = await client.query(
          "select * from app_public.payments where event_id = $1",
          [event.id]
        )
        expect(rows).toEqual([])
      }))

    it("shows payments to members of the event's organization", () =>
      withRootDb(async (client) => {
        const { organization, event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        const payment = await insertPayment(client, registration)
        const member = await createOrganizationMember(client, organization.id)

        await becomeUser(client, member.id)
        const { rows } = await client.query(
          "select id from app_public.payments where event_id = $1",
          [event.id]
        )
        expect(rows).toEqual([{ id: payment.id }])
      }))

    it("shows payments to admins", () =>
      withRootDb(async (client) => {
        const { event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        const payment = await insertPayment(client, registration)
        const [admin] = await createUsers(client, 1, true, true)

        await becomeUser(client, admin.id)
        const { rows } = await client.query(
          "select id from app_public.payments where event_id = $1",
          [event.id]
        )
        expect(rows).toEqual([{ id: payment.id }])
      }))

    it("does not let visitors write payments directly", () =>
      withAdminUserDb(async (client, admin) => {
        const { event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        const payment = await insertPayment(client, registration)
        await becomeUser(client, admin.id)

        await client.query("savepoint s")
        await expect(
          client.query(
            `insert into app_public.payments(event_name, quota_title, method, ticket_amount_cents)
              values ('{}', '{}', 'MANUAL', 100)`
          )
        ).rejects.toThrow("permission denied")
        await client.query("rollback to savepoint s")

        await expect(
          client.query(
            "update app_public.payments set status = 'REFUNDED' where id = $1",
            [payment.id]
          )
        ).rejects.toThrow("permission denied")
        await client.query("rollback to savepoint s")

        await expect(
          client.query("delete from app_public.payments where id = $1", [
            payment.id,
          ])
        ).rejects.toThrow("permission denied")
        await client.query("rollback to savepoint s")
      }))
  })

  describe("one paid payment per registration", () => {
    it("rejects a second PAID row for the same registration", () =>
      withRootDb(async (client) => {
        const { event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        await insertPayment(client, registration, { status: "PAID" })

        await expect(
          insertPayment(client, registration, { status: "PAID" })
        ).rejects.toThrow("payments_one_paid_per_registration_idx")
      }))

    it("allows any number of non-paid rows next to a paid one", () =>
      withRootDb(async (client) => {
        const { event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        await insertPayment(client, registration, { status: "PAID" })
        await insertPayment(client, registration, { status: "EXPIRED" })
        await insertPayment(client, registration, { status: "PENDING" })
        await insertPayment(client, registration, { status: "REFUNDED" })

        const { rows } = await client.query(
          "select count(*)::int as count from app_public.payments where registration_id = $1",
          [registration.id]
        )
        expect(rows[0].count).toBe(4)
      }))

    it("allows several PAID rows once their registration is gone", () =>
      withRootDb(async (client) => {
        const { event, quota } = await createPaidEventData(client)
        const { registration: first } = await register(
          client,
          event.id,
          quota.id
        )
        const { registration: second } = await register(
          client,
          event.id,
          quota.id
        )
        await insertPayment(client, first)
        await insertPayment(client, second)

        await client.query(
          "delete from app_public.registrations where id = any($1)",
          [[first.id, second.id]]
        )
        const { rows } = await client.query(
          "select registration_id, status from app_public.payments where event_id = $1",
          [event.id]
        )
        expect(rows).toEqual([
          { registration_id: null, status: "PAID" },
          { registration_id: null, status: "PAID" },
        ])
      }))
  })

  it("keeps payment rows when the GDPR job deletes registrations", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      const payment = await insertPayment(client, registration)

      // Move the event 90 days into the past so the GDPR job picks it up
      const start = dayjs().subtract(90, "day")
      await client.query(
        `update app_public.events set
          registration_start_time = $2,
          registration_end_time = $3,
          event_start_time = $4,
          event_end_time = $5
        where id = $1`,
        [
          event.id,
          start.toDate(),
          start.add(1, "day").toDate(),
          start.add(2, "day").toDate(),
          start.add(3, "day").toDate(),
        ]
      )

      await clearJobs(client)
      await asRoot(client, () =>
        client.query(
          "select graphile_worker.add_job('gdpr__delete_event_registrations', '{}'::json)"
        )
      )
      await runJobs(client)

      // Retention is not a cancellation: nothing is refunded
      expect(await getJobs(client, "payment__refund")).toEqual([])

      const { rows: registrations } = await client.query(
        "select id from app_public.registrations where id = $1",
        [registration.id]
      )
      expect(registrations).toEqual([])

      const {
        rows: [kept],
      } = await client.query(
        "select * from app_public.payments where id = $1",
        [payment.id]
      )
      expect(kept).toMatchObject({
        registration_id: null,
        event_id: event.id,
        quota_id: quota.id,
        status: "PAID",
        ticket_amount_cents: 1800,
      })
    }))
})

describe("payment check constraints", () => {
  it.each([1, 24, -25, 1000001, 2147483647])(
    "rejects a quota price of %i cents",
    (price) =>
      withRootDb(async (client) => {
        const { quota } = await createPaidEventData(client)
        await expect(
          client.query(
            "update app_public.quotas set price_cents = $2 where id = $1",
            [quota.id, price]
          )
        ).rejects.toThrow(
          'violates check constraint "quotas_price_cents_check"'
        )
      })
  )

  it.each([0, 25, 1800, 1000000])(
    "accepts a quota price of %i cents",
    (price) =>
      withRootDb(async (client) => {
        const { quota } = await createPaidEventData(client)
        const { rows } = await client.query(
          "update app_public.quotas set price_cents = $2 where id = $1 returning price_cents",
          [quota.id, price]
        )
        expect(rows[0].price_cents).toBe(price)
      })
  )

  it("defaults existing and new quotas to free", () =>
    withRootDb(async (client) => {
      const { event } = await createPaidEventData(client)
      const { rows } = await client.query(
        `insert into app_public.quotas(event_id, position, title, size)
          values ($1, 1, '{"fi": "Uusi", "en": "New"}', 5) returning price_cents`,
        [event.id]
      )
      expect(rows[0].price_cents).toBe(0)
    }))

  it("requires the close email in AFTER_REGISTRATION mode", () =>
    withRootDb(async (client) => {
      const { event } = await createPaidEventData(client, {
        paymentMode: "NONE",
      })
      await expect(
        client.query(
          `update app_public.events
            set payment_mode = 'AFTER_REGISTRATION', send_unpaid_email_on_close = false
            where id = $1`,
          [event.id]
        )
      ).rejects.toThrow(
        "_cnstr_check_events_after_registration_sends_unpaid_email"
      )
    }))

  it("allows the close email to be off in the other modes", () =>
    withRootDb(async (client) => {
      const { event } = await createPaidEventData(client, {
        paymentMode: "NONE",
      })
      for (const mode of ["NONE", "DURING_REGISTRATION"]) {
        const { rows } = await client.query(
          `update app_public.events
            set payment_mode = $2, send_unpaid_email_on_close = false
            where id = $1 returning payment_mode`,
          [event.id, mode]
        )
        expect(rows[0].payment_mode).toBe(mode)
      }
    }))

  it("defaults events to no payments", () =>
    withRootDb(async (client) => {
      const { event } = await createPaidEventData(client)
      const { rows } = await client.query(
        `select
          column_default
        from information_schema.columns
        where table_schema = 'app_public' and table_name = 'events' and column_name = 'payment_mode'`
      )
      expect(rows[0].column_default).toBe("'NONE'::app_public.payment_mode")
      expect(event.unpaid_close_email_sent_at).toBeNull()
      expect(event.last_payment_reminder_sent_at).toBeNull()
    }))
})
