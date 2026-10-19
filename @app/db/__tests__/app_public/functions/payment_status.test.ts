import { PoolClient } from "pg"

import { asRoot, becomeUser, createUsers, withRootDb } from "../../helpers"
import {
  createOrganizationMember,
  createPaidEventData,
  insertPayment,
  register,
} from "../../payments"

/*
 * registrations_payment_status and events_payment_summary: the organizer-only
 * computed columns.
 */

const paymentStatus = async (client: PoolClient, registrationId: string) => {
  const { rows } = await client.query(
    `select app_public.registrations_payment_status(r) as status
      from app_public.registrations r where r.id = $1`,
    [registrationId]
  )
  return rows[0].status
}

const paymentSummary = async (client: PoolClient, eventId: string) => {
  const { rows } = await client.query(
    `select (app_public.events_payment_summary(e)).* from app_public.events e where e.id = $1`,
    [eventId]
  )
  return rows[0]
}

/** Makes the user the test then views as, returning their id (null: anonymous). */
type Viewer = (client: PoolClient) => Promise<string | null>

const anAdmin: Viewer = async (client) => {
  const [admin] = await createUsers(client, 1, true, true)
  return admin.id
}
const anonymous: Viewer = async () => null
const aUserWithoutEventPermissions: Viewer = async (client) => {
  const [user] = await createUsers(client, 1)
  return user.id
}

describe("registrations_payment_status", () => {
  it("returns every state for a member of the event's organization", () =>
    withRootDb(async (client) => {
      const { organization, event, quota } = await createPaidEventData(client)
      const freeQuota = await asRoot(client, async () => {
        const { rows } = await client.query(
          `insert into app_public.quotas(event_id, position, title, size)
            values ($1, 1, '{"fi": "Ilmainen", "en": "Free"}', 10) returning *`,
          [event.id]
        )
        return rows[0]
      })

      const { registration: unpaid } = await register(
        client,
        event.id,
        quota.id
      )
      const { registration: paid } = await register(client, event.id, quota.id)
      const { registration: paidManually } = await register(
        client,
        event.id,
        quota.id
      )
      const { registration: refunded } = await register(
        client,
        event.id,
        quota.id
      )
      const { registration: free } = await register(
        client,
        event.id,
        freeQuota.id
      )
      // Expired and pending checkout sessions don't count as paid
      await insertPayment(client, unpaid, { status: "EXPIRED" })
      await insertPayment(client, unpaid, { status: "PENDING" })
      await insertPayment(client, paid, { status: "EXPIRED" })
      await insertPayment(client, paid, { status: "PAID" })
      await insertPayment(client, paidManually, {
        method: "MANUAL",
        status: "PAID",
      })
      await insertPayment(client, refunded, { status: "REFUNDED" })

      const member = await createOrganizationMember(client, organization.id)
      await becomeUser(client, member.id)

      expect(await paymentStatus(client, unpaid.id)).toBe("UNPAID")
      expect(await paymentStatus(client, paid.id)).toBe("PAID")
      expect(await paymentStatus(client, paidManually.id)).toBe("PAID_MANUALLY")
      expect(await paymentStatus(client, refunded.id)).toBe("REFUNDED")
      expect(await paymentStatus(client, free.id)).toBe("NOT_REQUIRED")
    }))

  it("is NOT_REQUIRED for an unpaid registration once the event has no payments", () =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration: unpaid } = await register(
        client,
        event.id,
        quota.id
      )
      const { registration: paid } = await register(client, event.id, quota.id)
      await insertPayment(client, paid)
      await client.query(
        "update app_public.events set payment_mode = 'NONE' where id = $1",
        [event.id]
      )
      const [admin] = await createUsers(client, 1, true, true)
      await becomeUser(client, admin.id)

      expect(await paymentStatus(client, unpaid.id)).toBe("NOT_REQUIRED")
      // Payments made before the switch are still shown
      expect(await paymentStatus(client, paid.id)).toBe("PAID")
    }))

  type AddPayments = (
    client: PoolClient,
    registration: { id: string; event_id: string; quota_id: string }
  ) => Promise<unknown>
  const noPayment: AddPayments = async () => undefined
  const aCardPayment: AddPayments = (client, registration) =>
    insertPayment(client, registration)

  it.each([
    ["is visible to admins", anAdmin, noPayment, "UNPAID"],
    ["is null for anonymous users", anonymous, aCardPayment, null],
    [
      "is null for users without event permissions",
      aUserWithoutEventPermissions,
      aCardPayment,
      null,
    ],
  ])("%s", (_case, viewer, addPayments, expected) =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      const { registration } = await register(client, event.id, quota.id)
      await addPayments(client, registration)
      await becomeUser(client, await viewer(client))
      expect(await paymentStatus(client, registration.id)).toBe(expected)
    })
  )
})

describe("events_payment_summary", () => {
  it("counts registrations holding a spot and sums paid tickets", () =>
    withRootDb(async (client) => {
      // Four spots in the quota and one in the open quota; the sixth
      // registration is queued.
      const { organization, event, quota } = await createPaidEventData(client, {
        priceCents: 1000,
        quotaSize: 4,
        openQuotaSize: 1,
      })
      const registrations = []
      for (let i = 0; i < 6; i++) {
        const { registration } = await register(client, event.id, quota.id)
        registrations.push(registration)
      }
      // Registrations made in one transaction share created_at, so the
      // database decides who gets which spot: assign the roles from that
      const { rows: statuses } = await client.query(
        `select id, status from app_hidden.registrations_status_and_position where event_id = $1`,
        [event.id]
      )
      const withStatus = (status: string) =>
        registrations.filter(
          (r) => statuses.find((s) => s.id === r.id)?.status === status
        )
      const [stripe, manual, unpaid1, unpaid2] = withStatus("IN_QUOTA")
      const [inOpenQuota] = withStatus("IN_OPEN_QUOTA")
      const [queued] = withStatus("IN_QUEUE")
      expect(unpaid1 && unpaid2 && inOpenQuota && queued).toBeTruthy()

      await insertPayment(client, stripe, { ticketAmountCents: 1000 })
      await insertPayment(client, manual, {
        method: "MANUAL",
        ticketAmountCents: 1000,
      })
      await insertPayment(client, inOpenQuota, {
        status: "PENDING",
        ticketAmountCents: 1000,
      })
      // A queued registration that paid anyway still counts towards the money
      await insertPayment(client, queued, { ticketAmountCents: 1000 })

      const member = await createOrganizationMember(client, organization.id)
      await becomeUser(client, member.id)

      expect(await paymentSummary(client, event.id)).toEqual({
        paid_count: 2,
        unpaid_count: 3,
        due_count: 5,
        tickets_paid_cents: 3000,
        // Two card payments: 1000 - 1,5 % × 1025 = 984,625 → 985 each.
        // The manual payment reaches the guild in full.
        guild_receives_cents: 985 + 1000 + 985,
      })
    }))

  type AddRegistrations = (
    client: PoolClient,
    event: { id: string },
    quota: { id: string }
  ) => Promise<unknown>
  const noRegistrations: AddRegistrations = async () => undefined
  const aPaidRegistration: AddRegistrations = async (client, event, quota) => {
    const { registration } = await register(client, event.id, quota.id)
    await insertPayment(client, registration)
  }
  const hidden = {
    paid_count: null,
    unpaid_count: null,
    due_count: null,
    tickets_paid_cents: null,
    guild_receives_cents: null,
  }

  it.each([
    [
      "is all zeros for an event without registrations",
      anAdmin,
      noRegistrations,
      {
        paid_count: 0,
        unpaid_count: 0,
        due_count: 0,
        tickets_paid_cents: 0,
        guild_receives_cents: 0,
      },
    ],
    ["is null for anonymous users", anonymous, aPaidRegistration, hidden],
    [
      "is null for users without event permissions",
      aUserWithoutEventPermissions,
      aPaidRegistration,
      hidden,
    ],
  ])("%s", (_case, viewer, addRegistrations, expected) =>
    withRootDb(async (client) => {
      const { event, quota } = await createPaidEventData(client)
      await addRegistrations(client, event, quota)
      await becomeUser(client, await viewer(client))
      expect(await paymentSummary(client, event.id)).toEqual(expected)
    })
  )
})
