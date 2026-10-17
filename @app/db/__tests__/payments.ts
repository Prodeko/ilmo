import { PoolClient } from "pg"

import {
  asRoot,
  createEventCategories,
  createEvents,
  createQuotas,
  createUsers,
} from "./helpers"

/*
 * Shared setup for the payments tests. Everything runs as root inside the
 * caller's transaction (which the with*Db helpers roll back).
 */

export type PaymentMode = "NONE" | "DURING_REGISTRATION" | "AFTER_REGISTRATION"

interface PaidEventOptions {
  paymentMode?: PaymentMode
  priceCents?: number
  quotaSize?: number
  openQuotaSize?: number
}

/**
 * Creates an organization (the current session's user, if any, becomes its
 * owner member), a category, an event with an open signup and one quota, and sets
 * the event's payment mode and the quota's price.
 */
export async function createPaidEventData(
  client: PoolClient,
  {
    paymentMode = "DURING_REGISTRATION",
    priceCents = 1800,
    quotaSize = 10,
    openQuotaSize = 0,
  }: PaidEventOptions = {}
) {
  return asRoot(client, async () => {
    // Like createOrganizations, but also works without a logged in user
    const {
      rows: [organization],
    } = await client.query(
      `insert into app_public.organizations(slug, name, color)
        values ('payments-org-' || gen_random_uuid(), 'Payments org', '#002e7d')
        returning *`
    )
    await client.query(
      `insert into app_public.organization_memberships(organization_id, user_id, is_owner)
        select $1, app_public.current_user_id(), true
        where app_public.current_user_id() is not null`,
      [organization.id]
    )
    const [eventCategory] = await createEventCategories(
      client,
      1,
      organization.id
    )
    const [createdEvent] = await createEvents(
      client,
      1,
      organization.id,
      eventCategory.id,
      true,
      false,
      openQuotaSize
    )
    const [createdQuota] = await createQuotas(
      client,
      1,
      createdEvent.id,
      quotaSize
    )
    const {
      rows: [event],
    } = await client.query(
      `update app_public.events
        set
          payment_mode = $2::app_public.payment_mode,
          send_unpaid_email_on_close = $2::app_public.payment_mode = 'AFTER_REGISTRATION'
        where id = $1 returning *`,
      [createdEvent.id, paymentMode]
    )
    const {
      rows: [quota],
    } = await client.query(
      `update app_public.quotas set price_cents = $2 where id = $1 returning *`,
      [createdQuota.id, priceCents]
    )
    return { organization, eventCategory, event, quota }
  })
}

let registrationCounter = 0

/**
 * Registers through the real flow: claim_registration_token followed by
 * create_registration.
 */
export async function register(
  client: PoolClient,
  eventId: string,
  quotaId: string
) {
  return asRoot(client, async () => {
    const {
      rows: [tokens],
    } = await client.query(
      `select * from app_public.claim_registration_token($1, $2)`,
      [eventId, quotaId]
    )
    registrationCounter++
    const {
      rows: [registration],
    } = await client.query(
      `select * from app_public.create_registration($1, $2, $3, $4, $5, $6)`,
      [
        tokens.registration_token,
        eventId,
        quotaId,
        "Testi",
        "Henkilö",
        `payer${registrationCounter}@example.com`,
      ]
    )
    return { registration, updateToken: tokens.update_token as string }
  })
}

interface PaymentOptions {
  method?: "STRIPE" | "MANUAL"
  status?: "PENDING" | "PAID" | "EXPIRED" | "REFUNDED"
  ticketAmountCents?: number
  serviceFeeCents?: number
}

/** Inserts a payment row for a registration, as the server or worker would. */
export async function insertPayment(
  client: PoolClient,
  registration: { id: string; event_id: string; quota_id: string },
  {
    method = "STRIPE",
    status = "PAID",
    ticketAmountCents = 1800,
    serviceFeeCents = method === "STRIPE" ? 25 : 0,
  }: PaymentOptions = {}
) {
  return asRoot(client, async () => {
    const {
      rows: [payment],
    } = await client.query(
      `insert into app_public.payments(
        registration_id, event_id, quota_id, event_name, quota_title,
        method, status, ticket_amount_cents, service_fee_cents, paid_at
      )
      values ($1, $2, $3, '{"fi": "Tapahtuma", "en": "Event"}', '{"fi": "Kiintiö", "en": "Quota"}',
        $4::app_public.payment_method, $5::app_public.payment_status, $6, $7,
        case when $5::app_public.payment_status = 'PAID' then now() end)
      returning *`,
      [
        registration.id,
        registration.event_id,
        registration.quota_id,
        method,
        status,
        ticketAmountCents,
        serviceFeeCents,
      ]
    )
    return payment
  })
}

/** Creates a non-admin user who is a member of the organization. */
export async function createOrganizationMember(
  client: PoolClient,
  organizationId: string
) {
  return asRoot(client, async () => {
    const [user] = await createUsers(client, 1)
    await client.query(
      `insert into app_public.organization_memberships(organization_id, user_id)
        values ($1, $2)`,
      [organizationId, user.id]
    )
    return user
  })
}
