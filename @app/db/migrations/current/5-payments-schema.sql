/*
 * Stripe payments: schema and database functions.
 *
 * Everything here is additive: new types, new tables and new columns with
 * defaults. An event whose payment_mode is 'NONE' (the default) behaves
 * exactly as before. Whether payments are switched on at all
 * (`paymentsEnabled()` in @app/lib) is decided by the server, worker and
 * client; the database only stores the settings and keeps the books.
 *
 * Money is always integer cents.
 *
 * This file is idempotent: the first block removes everything it creates so
 * that `graphile-migrate watch` can re-run it.
 */

/******************************************************************************/
-- Teardown (idempotency)

drop function if exists app_public.admin_send_payment_reminders(uuid);
drop function if exists app_public.admin_unmark_registration_paid(uuid);
drop function if exists app_public.admin_mark_registration_paid(uuid);
drop function if exists app_public.events_payment_summary(app_public.events);
drop function if exists app_public.registrations_payment_status(app_public.registrations);
drop function if exists app_hidden.backfill_registration_prices(uuid);
drop function if exists app_private.current_user_can_manage_event_payments(uuid);
drop function if exists app_private.queue_registration_refund(uuid);
drop trigger if exists _250_snapshot_price on app_public.registrations;
drop function if exists app_private.tg_registrations__snapshot_price();
drop function if exists app_public.admin_delete_registration(uuid, boolean);

drop table if exists app_private.stripe_events;
drop table if exists app_public.payments;

alter table app_public.events drop constraint if exists _cnstr_check_events_after_registration_sends_unpaid_email;
alter table app_public.events drop column if exists payment_mode;
alter table app_public.events drop column if exists send_unpaid_email_on_close;
alter table app_public.events drop column if exists unpaid_close_email_sent_at;
alter table app_public.events drop column if exists last_payment_reminder_sent_at;
alter table app_public.quotas drop column if exists price_cents;
alter table app_public.registrations drop column if exists price_cents;

alter type app_public.event_input drop attribute if exists payment_mode;
alter type app_public.event_input drop attribute if exists send_unpaid_email_on_close;
alter type app_public.create_event_quotas drop attribute if exists price_cents;
alter type app_public.update_event_quotas drop attribute if exists price_cents;

drop type if exists app_public.event_payment_summary;
drop type if exists app_public.registration_payment_status;
drop type if exists app_public.payment_status;
drop type if exists app_public.payment_method;
drop type if exists app_public.payment_mode;

/******************************************************************************/
-- Types

create type app_public.payment_mode as enum (
  'NONE',
  'DURING_REGISTRATION',
  'AFTER_REGISTRATION'
);
comment on type app_public.payment_mode is
  E'When an event collects payment: not at all, right after registering, or once registration has closed.';

create type app_public.payment_method as enum (
  'STRIPE',
  'MANUAL'
);
comment on type app_public.payment_method is
  E'How a payment was made: by card through Stripe Checkout, or marked paid by an organizer (cash, bank transfer).';

create type app_public.payment_status as enum (
  'PENDING',
  'PAID',
  'EXPIRED',
  'REFUNDED'
);
comment on type app_public.payment_status is
  E'State of a single payment attempt.';

create type app_public.registration_payment_status as enum (
  'NOT_REQUIRED',
  'UNPAID',
  'PAID',
  'PAID_MANUALLY',
  'REFUNDED'
);
comment on type app_public.registration_payment_status is
  E'Payment state of a registration as shown to organizers.';

create type app_public.event_payment_summary as (
  paid_count integer,
  unpaid_count integer,
  due_count integer,
  tickets_paid_cents integer,
  guild_receives_cents integer
);
comment on type app_public.event_payment_summary is
  E'Payment totals for an event, for organizers.';

alter type app_public.event_input
  add attribute payment_mode app_public.payment_mode,
  add attribute send_unpaid_email_on_close boolean;
alter type app_public.create_event_quotas
  add attribute price_cents integer;
alter type app_public.update_event_quotas
  add attribute price_cents integer;

/******************************************************************************/
-- Columns

alter table app_public.events
  add column payment_mode app_public.payment_mode not null default 'NONE',
  add column send_unpaid_email_on_close boolean not null default false,
  add column unpaid_close_email_sent_at timestamptz,
  add column last_payment_reminder_sent_at timestamptz,
  add constraint _cnstr_check_events_after_registration_sends_unpaid_email
    check (payment_mode <> 'AFTER_REGISTRATION' or send_unpaid_email_on_close);

comment on column app_public.events.payment_mode is
  E'When payment is collected for this event. NONE means the event has no payments.';
comment on column app_public.events.send_unpaid_email_on_close is
  E'Email the payment link to unpaid participants holding a spot when registration closes. Always true in AFTER_REGISTRATION mode.';
comment on column app_public.events.unpaid_close_email_sent_at is
  E'When the close-of-registration payment email was sent. Set once by the worker.';
comment on column app_public.events.last_payment_reminder_sent_at is
  E'When an organizer last sent payment reminders to all unpaid participants.';

grant
  insert(payment_mode, send_unpaid_email_on_close),
  update(payment_mode, send_unpaid_email_on_close)
on app_public.events to :DATABASE_VISITOR;

alter table app_public.quotas
  add column price_cents integer not null default 0
    constraint quotas_price_cents_check check (price_cents = 0 or price_cents >= 25);

comment on column app_public.quotas.price_cents is
  E'Ticket price in cents. 0 means the quota is free; a paid price is at least 25 cents so that the total charge with the service fee reaches Stripe''s minimum.';

grant
  insert(price_cents),
  update(price_cents)
on app_public.quotas to :DATABASE_VISITOR;

alter table app_public.registrations
  add column price_cents integer;

comment on column app_public.registrations.price_cents is
  E'Ticket price in cents at the time of registering (a snapshot of the quota price). Null when no payment applies.';

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
  refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
  currency text not null default 'eur',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_refund_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_by uuid references app_public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table app_public.payments is
  E'@omit create,update,delete\nPayments for registrations. Rows outlive their registration (and event and quota) so they can be reconciled with Stripe payouts; they hold no personal data.';
comment on column app_public.payments.registration_id is
  E'The registration paid for. Null once the registration has been deleted.';
comment on column app_public.payments.event_id is
  E'The event paid for. Null once the event has been deleted.';
comment on column app_public.payments.quota_id is
  E'The quota paid for. Null once the quota has been deleted.';
comment on column app_public.payments.event_name is
  E'Snapshot of the event name when the payment was created.';
comment on column app_public.payments.quota_title is
  E'Snapshot of the quota title when the payment was created.';
comment on column app_public.payments.ticket_amount_cents is
  E'Ticket price paid, in cents.';
comment on column app_public.payments.service_fee_cents is
  E'Service fee paid on top of the ticket, in cents. 0 for manual payments.';
comment on column app_public.payments.refunded_amount_cents is
  E'Amount refunded, in cents.';
comment on column app_public.payments.created_by is
  E'The organizer who recorded a manual payment.';

create index payments_registration_id_idx on app_public.payments(registration_id);
create index payments_event_id_idx on app_public.payments(event_id);
create index payments_quota_id_idx on app_public.payments(quota_id);
create index payments_created_by_idx on app_public.payments(created_by);
create index payments_stripe_payment_intent_id_idx on app_public.payments(stripe_payment_intent_id);

-- A registration can be paid only once. Duplicate Stripe payments are kept as
-- separate rows and refunded, so this is what makes that handling safe.
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
-- Event and quota functions

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
 * Built on current/2-delete-omitted-quotas-and-questions.sql. A null
 * price_cents keeps an existing quota's price (and makes a new quota free),
 * so callers that don't know about prices leave them untouched.
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

create or replace function app_public.create_event(
  event app_public.event_input,
  quotas app_public.create_event_quotas[],
  questions app_public.create_event_questions[] default null
)
returns app_public.events as $$
#variable_conflict use_variable
declare
  v_event app_public.events;
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Create the event
  insert into app_public.events(
    slug,
    name,
    description,
    location,
    event_start_time,
    event_end_time,
    registration_start_time,
    registration_end_time,
    is_highlighted,
    is_draft,
    header_image_file,
    open_quota_size,
    owner_organization_id,
    category_id
  )
  values (
    event.slug,
    event.name,
    event.description,
    event.location,
    event.event_start_time,
    event.event_end_time,
    event.registration_start_time,
    event.registration_end_time,
    event.is_highlighted,
    event.is_draft,
    event.header_image_file,
    event.open_quota_size,
    event.owner_organization_id,
    event.category_id
  )
  returning * into v_event;

  -- Create quotas and questions
  perform * from app_public.create_event_quotas(v_event.id, quotas);
  perform * from app_public.create_event_questions(v_event.id, questions);

  -- Payment settings. Set after the insert above, which is kept as it was so
  -- that events without payment settings are created exactly as before.
  if event.payment_mode is not null or event.send_unpaid_email_on_close is not null then
    update app_public.events as e
      set
        payment_mode = coalesce(event.payment_mode, e.payment_mode),
        -- The close email is how participants get the payment link in
        -- AFTER_REGISTRATION mode, so it is always on there.
        send_unpaid_email_on_close =
          coalesce(event.payment_mode, e.payment_mode) = 'AFTER_REGISTRATION'
          or coalesce(event.send_unpaid_email_on_close, e.send_unpaid_email_on_close)
      where e.id = v_event.id
    returning * into v_event;
  end if;

  return v_event;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;

/*
 * Snapshots the current quota price onto finished registrations of the event
 * that have none yet. Used when an event switches from NONE to a paid mode,
 * so that existing registrations become unpaid at today's price.
 *
 * Lives in app_hidden (callable but not exposed through GraphQL) because
 * update_event runs as the visitor, who may not update registrations.price_cents.
 */
create function app_hidden.backfill_registration_prices(event_id uuid)
returns integer as $$
declare
  v_count integer;
begin
  if not app_private.current_user_can_manage_event_payments(backfill_registration_prices.event_id) then
    raise exception 'Access denied.' using errcode = 'DNIED';
  end if;

  update app_public.registrations as r
    set price_cents = q.price_cents
    from app_public.quotas as q, app_public.events as e
    where
      r.event_id = backfill_registration_prices.event_id
      and q.id = r.quota_id
      and e.id = r.event_id
      and e.payment_mode <> 'NONE'
      and r.is_finished is true
      and r.price_cents is null
      and q.price_cents > 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_hidden.backfill_registration_prices(event_id uuid) is
  E'Sets price_cents from the quota price on finished registrations of a paid event that have no price yet. Returns the number of registrations updated.';

create or replace function app_public.update_event(
  id uuid,
  event app_public.event_input,
  quotas app_public.update_event_quotas[],
  questions app_public.update_event_questions[] default null
)
returns app_public.events as $$
#variable_conflict use_column
declare
  v_event app_public.events;
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Create the event
  update app_public.events
    set
      slug = coalesce(event.slug, slug),
      name = coalesce(event.name, name),
      description = coalesce(event.description, description),
      location = coalesce(event.location, location),
      event_start_time = coalesce(event.event_start_time, event_start_time),
      event_end_time = coalesce(event.event_end_time, event_end_time),
      registration_start_time = coalesce(event.registration_start_time, registration_start_time),
      registration_end_time = coalesce(event.registration_end_time, registration_end_time),
      is_highlighted = coalesce(event.is_highlighted, is_highlighted),
      is_draft = coalesce(event.is_draft, is_draft),
      header_image_file = coalesce(event.header_image_file, header_image_file),
      open_quota_size = coalesce(event.open_quota_size, open_quota_size),
      owner_organization_id = coalesce(event.owner_organization_id, owner_organization_id),
      category_id = coalesce(event.category_id, category_id)
    where id = update_event.id
  returning * into v_event;

  -- Update quotas and questions
  perform * from app_public.update_event_quotas(id, quotas);
  perform * from app_public.update_event_questions(id, questions);

  -- Payment settings. Updated after the statements above, which are kept as
  -- they were so that events without payment settings are updated exactly
  -- as before.
  if event.payment_mode is not null or event.send_unpaid_email_on_close is not null then
    declare
      v_old_payment_mode app_public.payment_mode := v_event.payment_mode;
    begin
      update app_public.events as e
        set
          payment_mode = coalesce(event.payment_mode, e.payment_mode),
          -- Always on in AFTER_REGISTRATION mode, see create_event
          send_unpaid_email_on_close =
            coalesce(event.payment_mode, e.payment_mode) = 'AFTER_REGISTRATION'
            or coalesce(event.send_unpaid_email_on_close, e.send_unpaid_email_on_close)
        where e.id = update_event.id
      returning * into v_event;

      -- Switching from no payments to a paid mode makes existing
      -- registrations in paid quotas unpaid at the (just saved) quota price.
      if v_old_payment_mode = 'NONE' and v_event.payment_mode <> 'NONE' then
        perform app_hidden.backfill_registration_prices(v_event.id);
      end if;
    end;
  end if;

  return v_event;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;

/******************************************************************************/
-- Registration functions

/*
 * Snapshot the ticket price when a registration is finished. create_registration
 * finishes the row (is_finished false -> true) in a single update, so setting
 * the price here, in a before trigger of that same update, keeps
 * create_registration unchanged and still fires the confirmation email
 * trigger exactly once. Registrations of events without payments, and of
 * free quotas, get no price (null).
 */
create function app_private.tg_registrations__snapshot_price() returns trigger as $$
begin
  if NEW.is_finished is true and (TG_OP = 'INSERT' or OLD.is_finished is not true) then
    select q.price_cents into NEW.price_cents
      from app_public.quotas as q
      join app_public.events as e on e.id = q.event_id
      where
        q.id = NEW.quota_id
        and e.id = NEW.event_id
        and e.payment_mode <> 'NONE'
        and q.price_cents > 0;
  end if;
  return NEW;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_private.tg_registrations__snapshot_price() is
  E'Sets registrations.price_cents from the quota price when a registration of a paid event is finished.';

create trigger _250_snapshot_price
  before insert or update on app_public.registrations
  for each row
  execute procedure app_private.tg_registrations__snapshot_price();

/*
 * Queues a refund of the ticket price when the registration has a card
 * payment. Must run before the registration is deleted: afterwards the
 * payment row's registration_id is null. The payment row itself survives the
 * delete (on delete set null) for bookkeeping.
 */
create function app_private.queue_registration_refund(registration_id uuid)
returns void as $$
declare
  v_payment_id uuid;
begin
  select p.id into v_payment_id
    from app_public.payments as p
    where
      p.registration_id = queue_registration_refund.registration_id
      and p.status = 'PAID'
      and p.method = 'STRIPE';

  if v_payment_id is not null then
    perform graphile_worker.add_job(
      'payment__refund',
      json_build_object('paymentId', v_payment_id)
    );
  end if;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_private.queue_registration_refund(registration_id uuid) is
  E'Queues payment__refund for the registration''s paid Stripe payment, if it has one. Manual payments are never refunded by Ilmo.';

drop function if exists app_public.admin_delete_registration(uuid);

create function app_public.admin_delete_registration(id uuid, refund boolean default true)
returns boolean as $$
declare
  v_registration_id uuid;
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Refund the ticket price of a card payment unless the admin opted out
  if coalesce(refund, true) then
    perform app_private.queue_registration_refund(admin_delete_registration.id);
  end if;

  -- Delete registration and associated secrets (foreign key has on delete)
  delete from app_public.registrations r where r.id = admin_delete_registration.id returning r.id into v_registration_id;

  if v_registration_id is null then
    raise exception 'Registration was not found.' using errcode = 'NTFND';
  end if;

  return true;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.admin_delete_registration(id uuid, refund boolean) is
  E'Mutation only accessible to admin users. Allows deleting a registration via the admin panel. In contrast to deleteRegistration, adminDeleteRegistration also allows deleting a registrations once the event signup has closed. If the registration was paid by card and refund is true (the default), the ticket price is refunded; the service fee is not.';

create or replace function app_public.delete_registration("updateToken" text)
returns boolean as $$
declare
  v_registration_id uuid;
  v_registration app_public.registrations;
  v_event app_public.events;
begin
  select registration_id into v_registration_id
    from app_private.registration_secrets
    where update_token = "updateToken";

  if v_registration_id is null then
    raise exception 'Registration matching token was not found.' using errcode = 'NTFND';
  end if;

  select * into v_registration from app_public.registrations where id = v_registration_id;
  select * into v_event from app_public.events where id = v_registration.event_id;

  if (v_event is null) or not (select app_public.events_signup_open(v_event)) then
    raise exception 'Deleting a registration after event signup has closed is not allowed. Please contact the event organizers.' using errcode = 'DNIED';
  end if;

  -- A cancelled card payment is always refunded (ticket price only)
  perform app_private.queue_registration_refund(v_registration_id);

  -- Delete registration and associated secrets (foreign key has on delete)
  delete from app_public.registrations where id = v_registration_id;

  return true;
end;
$$ language plpgsql volatile security definer set search_path to pg_catalog, public, pg_temp;

/******************************************************************************/
-- Computed columns for organizers

create function app_public.registrations_payment_status(registration app_public.registrations)
returns app_public.registration_payment_status as $$
  select
    case
      when not app_private.current_user_can_manage_event_payments(registration.event_id)
        then null
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
      when exists(
        select 1 from app_public.payments as p
        where p.registration_id = registration.id and p.status = 'REFUNDED'
      )
        then 'REFUNDED'::app_public.registration_payment_status
      when coalesce(registration.price_cents, 0) = 0
        or (select e.payment_mode from app_public.events as e where e.id = registration.event_id) = 'NONE'
        then 'NOT_REQUIRED'::app_public.registration_payment_status
      else 'UNPAID'::app_public.registration_payment_status
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
    select p.method, p.ticket_amount_cents
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
            else floor((1000 * ticket_amount_cents - 15 * (ticket_amount_cents + 25))::numeric / 1000 + 0.5)
          end
        ), 0) from paid)::integer
      )::app_public.event_payment_summary
    end;
$$ language sql stable security definer set search_path to pg_catalog, public, pg_temp;
comment on function app_public.events_payment_summary(e app_public.events) is
  E'Payment totals for organizers: counts of registrations holding a spot (in quota or open quota) that are paid, unpaid and due, the ticket amount paid and the estimated amount the guild receives. Null unless the current user may manage the event''s payments.';

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

  if v_registration.is_finished is not true or coalesce(v_registration.price_cents, 0) = 0 then
    raise exception 'This registration does not require payment.' using errcode = 'DNIED';
  end if;

  if exists(
    select 1 from app_public.payments as p
    where p.registration_id = v_registration.id and p.status = 'PAID'
  ) then
    raise exception 'This registration has already been paid.' using errcode = 'DNIED';
  end if;

  select * into v_event from app_public.events where id = v_registration.event_id;
  select * into v_quota from app_public.quotas where id = v_registration.quota_id;

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
    v_registration.price_cents,
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
  E'Records a manual payment (cash, bank transfer) for a registration and emails the participant a payment confirmation.';

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
begin
  if not exists(select 1 from app_public.events as e where e.id = admin_send_payment_reminders.event_id) then
    raise exception 'Event was not found.' using errcode = 'NTFND';
  end if;

  if not app_private.current_user_can_manage_event_payments(admin_send_payment_reminders.event_id) then
    raise exception 'Access denied.' using errcode = 'DNIED';
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
    order by r.created_at
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
  E'Emails a payment reminder to every finished, unpaid registration holding a spot in the event. Returns the number of reminders queued.';
