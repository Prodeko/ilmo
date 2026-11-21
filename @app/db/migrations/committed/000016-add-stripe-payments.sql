--! Previous: sha1:a82534fccfc43de4a5611c2911fbf0d72b9b9c05
--! Hash: sha1:ee27fe2667031e53f857909f275a6687335676cd
--! Message: add Stripe payments

--! split: 70-payments.sql
/*
 * Stripe payments: schema and database functions.
 *
 * Everything here is additive: new types, new tables and new columns with
 * defaults. An event is paid when one of its quotas has a price above 0; a
 * quota price of 0 (the default) behaves exactly as before.
 *
 * Two rules shape everything below:
 * - A registrant pays only after the event's registration has closed (the
 *   server enforces this when Checkout starts; the worker emails the payment
 *   link at the close).
 * - Ilmo never refunds. Deleting a registration, a quota or an event leaves
 *   its payments in place (detached, see app_public.payments); organizers
 *   refund by hand in Stripe.
 *
 * Gated by the `payments` feature flag. While it is off, nobody can start a
 * payment: create_event_quotas and update_event_quotas refuse a non-zero
 * price, the organizer payment actions refuse to run (errcode FTOFF), and the
 * server and worker refuse Checkout and payment emails. Payments already in
 * flight still settle: the computed payment status is never gated. The flag
 * reads as off unless the server has both Stripe secrets (`available`).
 *
 * Money is always integer cents.
 *
 * This file is idempotent: the first block removes everything it creates so
 * that `graphile-migrate watch` can re-run it.
 */

insert into app_public.feature_flags (key, description)
  values ('payments', E'Stripe payments for paid quotas: prices, the pay page, Checkout, organizer payment tools and payment emails.')
  on conflict (key) do nothing;

/******************************************************************************/
-- Teardown (idempotency)

drop function if exists app_public.admin_send_payment_reminders(uuid);
drop function if exists app_public.admin_unmark_registration_paid(uuid);
drop function if exists app_public.admin_mark_registration_paid(uuid);
drop function if exists app_public.events_payment_summary(app_public.events);
drop function if exists app_public.registrations_payment_status(app_public.registrations);
drop function if exists app_private.registration_payment_status(app_public.registrations);
drop function if exists app_private.current_user_can_manage_event_payments(uuid);
drop trigger if exists _250_reset_unpaid_close_email on app_public.events;
drop function if exists app_private.tg_events__reset_unpaid_close_email();

drop table if exists app_private.stripe_events;
drop table if exists app_public.payments;

alter table app_public.events drop column if exists unpaid_close_email_sent_at;
alter table app_public.events drop column if exists last_payment_reminder_sent_at;
alter table app_public.quotas drop column if exists price_cents;

alter type app_public.create_event_quotas drop attribute if exists price_cents;
alter type app_public.update_event_quotas drop attribute if exists price_cents;

drop type if exists app_public.event_payment_summary;
drop type if exists app_public.registration_payment_status;
drop type if exists app_public.payment_status;
drop type if exists app_public.payment_method;

/******************************************************************************/
-- Types

create type app_public.payment_method as enum (
  'STRIPE',
  'MANUAL'
);
comment on type app_public.payment_method is
  E'How a payment was made: by card through Stripe Checkout, or marked paid by an organizer (cash, bank transfer).';

create type app_public.payment_status as enum (
  'PENDING',
  'PAID',
  'EXPIRED'
);
comment on type app_public.payment_status is
  E'State of a single payment attempt.';

create type app_public.registration_payment_status as enum (
  'NOT_REQUIRED',
  'UNPAID',
  'PAID',
  'PAID_MANUALLY'
);
comment on type app_public.registration_payment_status is
  E'Payment state of a registration as shown to organizers.';

create type app_public.event_payment_summary as (
  paid_count integer,
  unpaid_count integer,
  due_count integer,
  tickets_paid_cents integer,
  guild_receives_cents integer,
  unlinked_card_payment_count integer
);
comment on type app_public.event_payment_summary is
  E'Payment totals for an event, for organizers.';

alter type app_public.create_event_quotas
  add attribute price_cents integer;
alter type app_public.update_event_quotas
  add attribute price_cents integer;

/******************************************************************************/
-- Columns

alter table app_public.events
  add column unpaid_close_email_sent_at timestamptz,
  add column last_payment_reminder_sent_at timestamptz;

comment on column app_public.events.unpaid_close_email_sent_at is
  E'When the close-of-registration payment email was sent. Set by the worker; cleared when registration_end_time moves later, so that the email goes out again at the new close.';
comment on column app_public.events.last_payment_reminder_sent_at is
  E'When an organizer last sent payment reminders to all unpaid participants.';

alter table app_public.quotas
  add column price_cents integer not null default 0
    constraint quotas_price_cents_check check (price_cents = 0 or price_cents between 25 and 1000000);

comment on column app_public.quotas.price_cents is
  E'Ticket price in cents. 0 means the quota is free; a paid price is at least 25 cents so that the total charge with the service fee reaches Stripe''s minimum, and at most 1 000 000 cents (10 000 €). Registrants pay the price in effect when they pay.';

grant
  insert(price_cents),
  update(price_cents)
on app_public.quotas to :DATABASE_VISITOR;

/*
 * Reopening or extending registration after the close email went out: the
 * email is sent again at the new close, so that registrations made in the
 * meantime get their payment link. Registrants who already paid get nothing
 * (the email goes to unpaid registrations only).
 */
create function app_private.tg_events__reset_unpaid_close_email() returns trigger as $$
begin
  NEW.unpaid_close_email_sent_at := null;
  return NEW;
end;
$$ language plpgsql volatile set search_path to pg_catalog, public, pg_temp;
comment on function app_private.tg_events__reset_unpaid_close_email() is
  E'Clears events.unpaid_close_email_sent_at when registration_end_time moves later.';

create trigger _250_reset_unpaid_close_email
  before update of registration_end_time on app_public.events
  for each row
  when (NEW.registration_end_time > OLD.registration_end_time)
  execute procedure app_private.tg_events__reset_unpaid_close_email();

/******************************************************************************/
-- Payments

create table app_public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references app_public.registrations(id) on delete set null,
  event_id uuid references app_public.events(id) on delete set null,
  quota_id uuid references app_public.quotas(id) on delete set null,
  event_name jsonb not null,
  quota_title jsonb not null,
  method app_public.payment_method not null,
  status app_public.payment_status not null default 'PENDING',
  ticket_amount_cents integer not null check (ticket_amount_cents >= 0),
  service_fee_cents integer not null default 0 check (service_fee_cents >= 0),
  currency text not null default 'eur',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_by uuid references app_public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table app_public.payments is
  E'@omit create,update,delete\nPayments for registrations. Rows outlive their registration (and event and quota) so they can be reconciled with Stripe payouts; they hold no personal data. Ilmo never refunds: a card payment without a registration is refunded by hand in Stripe, if at all.';
comment on column app_public.payments.registration_id is
  E'The registration paid for. Null once the registration has been deleted, and for a card payment that could not be applied to it (a second payment, or an amount that did not match).';
comment on column app_public.payments.event_id is
  E'The event paid for. Null once the event has been deleted.';
comment on column app_public.payments.quota_id is
  E'The quota paid for. Null once the quota has been deleted.';
comment on column app_public.payments.event_name is
  E'Snapshot of the event name when the payment was created.';
comment on column app_public.payments.quota_title is
  E'Snapshot of the quota title when the payment was created.';
comment on column app_public.payments.ticket_amount_cents is
  E'Ticket price paid, in cents: the quota price when the payment was started.';
comment on column app_public.payments.service_fee_cents is
  E'Service fee paid on top of the ticket, in cents. 0 for manual payments.';
comment on column app_public.payments.created_by is
  E'The organizer who recorded a manual payment.';

create index payments_registration_id_idx on app_public.payments(registration_id);
create index payments_event_id_idx on app_public.payments(event_id);
create index payments_quota_id_idx on app_public.payments(quota_id);
create index payments_created_by_idx on app_public.payments(created_by);
create index payments_stripe_payment_intent_id_idx on app_public.payments(stripe_payment_intent_id);

-- A registration can be paid only once. A second card payment is kept as a
-- separate PAID row detached from the registration.
create unique index payments_one_paid_per_registration_idx
  on app_public.payments(registration_id)
  where status = 'PAID' and registration_id is not null;

create trigger _100_timestamps
  before insert or update on app_public.payments
  for each row
  execute procedure app_private.tg__timestamps();

/*
 * Payment data is for organizers only. Organizers are admins (who manage
 * every event, like everywhere else in the admin UI) and members of the
 * event's owner organization.
 */
create function app_private.current_user_can_manage_event_payments(event_id uuid)
returns boolean as $$
  select app_public.current_user_is_admin()
    or app_public.current_user_has_event_permissions(event_id);
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_private.current_user_can_manage_event_payments(event_id uuid) is
  E'True if the current user may see and manage payments of the event: admins and members of the event''s owner organization.';

alter table app_public.payments enable row level security;

-- No insert/update/delete grants: writes go through security definer
-- functions below or through the server/worker root pool.
create policy select_event_permissions on app_public.payments
  for select using (
    app_public.current_user_is_admin()
    or app_public.current_user_has_event_permissions(event_id)
  );

grant select on app_public.payments to :DATABASE_VISITOR;

/*
 * Stripe webhook events that have been processed, for idempotency.
 */
create table app_private.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);
alter table app_private.stripe_events enable row level security;
comment on table app_private.stripe_events is
  E'Ids of Stripe webhook events already handled, so that redelivered events are ignored.';

/******************************************************************************/
-- Quota functions

create or replace function app_public.create_event_quotas(
  event_id uuid,
  quotas app_public.create_event_quotas[]
)
returns app_public.quotas[] as $$
declare
  v_input app_public.create_event_quotas;
  v_quota app_public.quotas;
  v_ret app_public.quotas[] default '{}';
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Must specify at least one quota
  if (select array_length(quotas, 1)) is null then
    raise exception 'You must specify at least one quota' using errcode = 'DNIED';
  end if;

  -- A price can be set only while payments are on
  if not app_public.feature_enabled('payments')
    and exists(select 1 from unnest(quotas) as q where coalesce(q.price_cents, 0) <> 0)
  then
    raise exception 'Payments are not available.' using errcode = 'FTOFF';
  end if;

  -- Create quotas
  foreach v_input in array quotas loop
    insert into app_public.quotas(event_id, position, title, size, price_cents)
      values (event_id, v_input.position, v_input.title, v_input.size, coalesce(v_input.price_cents, 0))
      returning * into v_quota;

    v_ret := array_append(v_ret, v_quota);
  end loop;

  return v_ret;
end;
$$ language plpgsql volatile security invoker set search_path to pg_catalog, public, pg_temp;

/*
 * Built on committed/000005.sql (null-id fix). A null price_cents keeps an
 * existing quota's price (and makes a new quota free), so callers that don't
 * know about prices leave them untouched. A non-zero price_cents is refused
 * while payments are off; a null or 0 is accepted. Changing a price is always
 * allowed: payments already made keep their amount and stay paid.
 */
create or replace function app_public.update_event_quotas(
  event_id uuid,
  quotas app_public.update_event_quotas[]
)
returns app_public.quotas[] as $$
#variable_conflict use_variable
declare
  v_quota_ids_to_delete uuid[];
  v_input app_public.update_event_quotas;
  v_quota app_public.quotas;
  v_ret app_public.quotas[] default '{}';
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Must specify at least one quota
  if (select array_length(quotas, 1)) is null then
    raise exception 'You must specify at least one quota' using errcode = 'DNIED';
  end if;

  -- A price can be set only while payments are on
  if not app_public.feature_enabled('payments')
    and exists(select 1 from unnest(quotas) as q where coalesce(q.price_cents, 0) <> 0)
  then
    raise exception 'Payments are not available.' using errcode = 'FTOFF';
  end if;

  select array(
    select id from app_public.quotas as q
    where q.event_id = event_id
    and q.id not in (select id from unnest(quotas) where id is not null)
  )
  into v_quota_ids_to_delete;

  -- Delete existing event quotas that were not supplied
  -- as input to this function
  delete from app_public.quotas as q
    where q.id = any(v_quota_ids_to_delete);

  foreach v_input in array quotas loop
    if exists(select 1 from app_public.quotas where id = v_input.id) then
      -- Update existing event quotas by id
      update app_public.quotas as q
        set
          position = v_input.position,
          title = v_input.title,
          size = v_input.size,
          price_cents = coalesce(v_input.price_cents, q.price_cents)
        where q.id = v_input.id
      returning * into v_quota;
    else
      -- Create new quotas that didn't exist before
      insert into app_public.quotas(event_id, position, title, size, price_cents)
        values (event_id, v_input.position, v_input.title, v_input.size, coalesce(v_input.price_cents, 0))
      returning * into v_quota;
    end if;

    v_ret := array_append(v_ret, v_quota);
  end loop;

  return v_ret;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;

/******************************************************************************/
-- Computed columns for organizers

/*
 * The payment state of a registration, without any permission check. Used by
 * the guarded computed column below and by the server (the /pay page and
 * Checkout) and the worker, which look registrations up without a user.
 *
 * A PAID payment makes the registration paid whatever its quota costs now:
 * changing a price never undoes a payment. Otherwise a finished registration
 * in a quota with a price above 0 is unpaid.
 */
create function app_private.registration_payment_status(registration app_public.registrations)
returns app_public.registration_payment_status as $$
  select
    case
      when exists(
        select 1 from app_public.payments as p
        where p.registration_id = registration.id and p.status = 'PAID' and p.method = 'MANUAL'
      )
        then 'PAID_MANUALLY'::app_public.registration_payment_status
      when exists(
        select 1 from app_public.payments as p
        where p.registration_id = registration.id and p.status = 'PAID'
      )
        then 'PAID'::app_public.registration_payment_status
      when registration.is_finished is true and exists(
        select 1 from app_public.quotas as q
        where q.id = registration.quota_id and q.price_cents > 0
      )
        then 'UNPAID'::app_public.registration_payment_status
      else 'NOT_REQUIRED'::app_public.registration_payment_status
    end;
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_private.registration_payment_status(registration app_public.registrations) is
  E'Payment status of the registration, without a permission check.';

create function app_public.registrations_payment_status(registration app_public.registrations)
returns app_public.registration_payment_status as $$
  select
    case
      when not app_private.current_user_can_manage_event_payments(registration.event_id)
        then null
      else app_private.registration_payment_status(registration)
    end;
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.registrations_payment_status(registration app_public.registrations) is
  E'@sortable\n@filterable\nPayment status of the registration. Null unless the current user may manage the event''s payments, because registrations are publicly readable.';

create function app_public.events_payment_summary(e app_public.events)
returns app_public.event_payment_summary as $$
  with in_spot as (
    select
      r.id,
      app_public.registrations_payment_status(r) as payment_status
    from app_public.registrations as r
    join app_hidden.registrations_status_and_position as s on s.id = r.id
    where
      r.event_id = e.id
      and r.is_finished is true
      and s.status in ('IN_QUOTA', 'IN_OPEN_QUOTA')
  ),
  paid as (
    select p.method, p.ticket_amount_cents, p.registration_id
    from app_public.payments as p
    where p.event_id = e.id and p.status = 'PAID'
  )
  select
    case when not app_private.current_user_can_manage_event_payments(e.id) then null else
      row(
        (select count(*) from in_spot where payment_status in ('PAID', 'PAID_MANUALLY'))::integer,
        (select count(*) from in_spot where payment_status = 'UNPAID')::integer,
        (select count(*) from in_spot where payment_status in ('PAID', 'PAID_MANUALLY', 'UNPAID'))::integer,
        (select coalesce(sum(ticket_amount_cents), 0) from paid)::integer,
        -- Same formula as guildReceivesCents in @app/lib: Stripe keeps the
        -- service fee and 1,5 % of the total, rounded to the cent (halves up).
        -- Manual payments reach the guild in full.
        (select coalesce(sum(
          case
            when method = 'MANUAL' or ticket_amount_cents = 0 then ticket_amount_cents
            -- In numeric, so large amounts can't overflow integer maths
            else floor((1000 * ticket_amount_cents::numeric - 15 * (ticket_amount_cents::numeric + 25)) / 1000 + 0.5)
          end
        ), 0) from paid)::integer,
        (select count(*) from paid where method = 'STRIPE' and registration_id is null)::integer
      )::app_public.event_payment_summary
    end;
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.events_payment_summary(e app_public.events) is
  E'Payment totals for organizers: counts of registrations holding a spot (in quota or open quota) that are paid, unpaid and due, the ticket amount paid, the estimated amount the guild receives and the number of card payments not linked to a registration (deleted registrations, second payments), which organizers may refund by hand in Stripe. Null unless the current user may manage the event''s payments.';

/******************************************************************************/
-- Organizer actions

create function app_public.admin_mark_registration_paid(registration_id uuid)
returns app_public.payments as $$
declare
  v_registration app_public.registrations;
  v_event app_public.events;
  v_quota app_public.quotas;
  v_payment app_public.payments;
begin
  select * into v_registration
    from app_public.registrations as r
    where r.id = admin_mark_registration_paid.registration_id;

  if v_registration.id is null then
    raise exception 'Registration was not found.' using errcode = 'NTFND';
  end if;

  if not app_private.current_user_can_manage_event_payments(v_registration.event_id) then
    raise exception 'Access denied.' using errcode = 'DNIED';
  end if;

  if not app_public.feature_enabled('payments') then
    raise exception 'Payments are not available.' using errcode = 'FTOFF';
  end if;

  select * into v_event from app_public.events where id = v_registration.event_id;
  select * into v_quota from app_public.quotas where id = v_registration.quota_id;

  if v_registration.is_finished is not true or v_quota.price_cents = 0 then
    raise exception 'This registration does not require payment.' using errcode = 'DNIED';
  end if;

  if exists(
    select 1 from app_public.payments as p
    where p.registration_id = v_registration.id and p.status = 'PAID'
  ) then
    raise exception 'This registration has already been paid.' using errcode = 'DNIED';
  end if;

  -- Queued registrations pay once they get a spot, like on the /pay page
  if exists(
    select 1 from app_hidden.registrations_status_and_position as s
    where s.id = v_registration.id and s.status = 'IN_QUEUE'
  ) then
    raise exception 'This registration is in the queue.' using errcode = 'DNIED';
  end if;

  insert into app_public.payments (
    registration_id,
    event_id,
    quota_id,
    event_name,
    quota_title,
    method,
    status,
    ticket_amount_cents,
    service_fee_cents,
    paid_at,
    created_by
  )
  values (
    v_registration.id,
    v_registration.event_id,
    v_registration.quota_id,
    v_event.name,
    v_quota.title,
    'MANUAL',
    'PAID',
    v_quota.price_cents,
    0,
    now(),
    app_public.current_user_id()
  )
  returning * into v_payment;

  perform graphile_worker.add_job(
    'payment__send_received_email',
    json_build_object('paymentId', v_payment.id)
  );

  return v_payment;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.admin_mark_registration_paid(registration_id uuid) is
  E'Records a manual payment (cash, bank transfer) of the current quota price for a registration and emails the participant a payment confirmation.';

create function app_public.admin_unmark_registration_paid(registration_id uuid)
returns boolean as $$
declare
  v_registration app_public.registrations;
  v_deleted_count integer;
begin
  select * into v_registration
    from app_public.registrations as r
    where r.id = admin_unmark_registration_paid.registration_id;

  if v_registration.id is null then
    raise exception 'Registration was not found.' using errcode = 'NTFND';
  end if;

  if not app_private.current_user_can_manage_event_payments(v_registration.event_id) then
    raise exception 'Access denied.' using errcode = 'DNIED';
  end if;

  if not app_public.feature_enabled('payments') then
    raise exception 'Payments are not available.' using errcode = 'FTOFF';
  end if;

  delete from app_public.payments as p
    where
      p.registration_id = v_registration.id
      and p.method = 'MANUAL'
      and p.status = 'PAID';

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 0 then
    raise exception 'This registration has no manual payment.' using errcode = 'NTFND';
  end if;

  return true;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.admin_unmark_registration_paid(registration_id uuid) is
  E'Removes a manual payment recorded with adminMarkRegistrationPaid. Card payments cannot be undone this way.';

create function app_public.admin_send_payment_reminders(event_id uuid)
returns integer as $$
declare
  v_registration_id uuid;
  v_count integer := 0;
  v_last_sent_at timestamptz;
begin
  if not exists(select 1 from app_public.events as e where e.id = admin_send_payment_reminders.event_id) then
    raise exception 'Event was not found.' using errcode = 'NTFND';
  end if;

  if not app_private.current_user_can_manage_event_payments(admin_send_payment_reminders.event_id) then
    raise exception 'Access denied.' using errcode = 'DNIED';
  end if;

  if not app_public.feature_enabled('payments') then
    raise exception 'Payments are not available.' using errcode = 'FTOFF';
  end if;

  -- A short cooldown, so a double click or a script can't email everyone
  -- many times over. The event row lock makes concurrent calls wait here
  -- and then see the first call's timestamp.
  select e.last_payment_reminder_sent_at into v_last_sent_at
    from app_public.events as e
    where e.id = admin_send_payment_reminders.event_id
    for update;
  if v_last_sent_at > now() - interval '10 minutes' then
    raise exception 'Payment reminders were sent less than 10 minutes ago. Try again later.' using errcode = 'DNIED';
  end if;

  for v_registration_id in
    select r.id
    from app_public.registrations as r
    join app_hidden.registrations_status_and_position as s on s.id = r.id
    where
      r.event_id = admin_send_payment_reminders.event_id
      and r.is_finished is true
      and s.status in ('IN_QUOTA', 'IN_OPEN_QUOTA')
      and app_public.registrations_payment_status(r) = 'UNPAID'
    order by r.created_at, r.id
  loop
    perform graphile_worker.add_job(
      'payment__send_reminder',
      json_build_object('registrationId', v_registration_id)
    );
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    update app_public.events as e
      set last_payment_reminder_sent_at = now()
      where e.id = admin_send_payment_reminders.event_id;
  end if;

  return v_count;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.admin_send_payment_reminders(event_id uuid) is
  E'Emails a payment reminder to every finished, unpaid registration holding a spot in the event. Returns the number of reminders queued. Refused for 10 minutes after the last reminders were sent.';
