import { PoolClient } from "pg"

import {
  becomeUser,
  createUsers,
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
    /** Makes the user the test then views as, returning their id (null: anonymous). */
    type Viewer = (
      client: PoolClient,
      organizationId: string
    ) => Promise<string | null>

    const anonymous: Viewer = async () => null
    const aUserWithoutEventPermissions: Viewer = async (client) => {
      const [user] = await createUsers(client, 1)
      return user.id
    }
    const aMember: Viewer = async (client, organizationId) => {
      const member = await createOrganizationMember(client, organizationId)
      return member.id
    }
    const anAdmin: Viewer = async (client) => {
      const [admin] = await createUsers(client, 1, true, true)
      return admin.id
    }

    const nothing = () => []
    const thePayment = (payment: { id: string }) => [{ id: payment.id }]

    it.each([
      ["hides payments from anonymous users", anonymous, nothing],
      [
        "hides payments from logged in users without event permissions",
        aUserWithoutEventPermissions,
        nothing,
      ],
      [
        "shows payments to members of the event's organization",
        aMember,
        thePayment,
      ],
      ["shows payments to admins", anAdmin, thePayment],
    ])("%s", (_case, viewer, visiblePayments) =>
      withRootDb(async (client) => {
        const { organization, event, quota } = await createPaidEventData(client)
        const { registration } = await register(client, event.id, quota.id)
        const payment = await insertPayment(client, registration)

        await becomeUser(client, await viewer(client, organization.id))
        const { rows } = await client.query(
          "select id from app_public.payments where event_id = $1",
          [event.id]
        )
        expect(rows).toEqual(visiblePayments(payment))
      })
    )

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
    it("allows any number of non-paid rows next to a paid one, but rejects a second PAID row", () =>
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

        await expect(
          insertPayment(client, registration, { status: "PAID" })
        ).rejects.toThrow("payments_one_paid_per_registration_idx")
      }))
  })
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
})
