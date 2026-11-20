--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_hidden; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app_hidden;


--
-- Name: app_private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app_private;


--
-- Name: app_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app_public;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: supported_languages; Type: TYPE; Schema: app_private; Owner: -
--

CREATE TYPE app_private.supported_languages AS ENUM (
    'fi',
    'en'
);


--
-- Name: TYPE supported_languages; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON TYPE app_private.supported_languages IS '@enum';


--
-- Name: claim_registration_token_output; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.claim_registration_token_output AS (
	registration_token text,
	update_token text
);


--
-- Name: constrained_name; Type: DOMAIN; Schema: app_public; Owner: -
--

CREATE DOMAIN app_public.constrained_name AS text
	CONSTRAINT constrained_name_check CHECK ((VALUE ~ '\S'::text));


--
-- Name: DOMAIN constrained_name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON DOMAIN app_public.constrained_name IS 'A name field which must not be empty or contain only whitespace';


--
-- Name: question_prefill; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.question_prefill AS ENUM (
    'TELEGRAM',
    'DIETARY_RESTRICTIONS'
);


--
-- Name: question_type; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.question_type AS ENUM (
    'TEXT',
    'RADIO',
    'CHECKBOX'
);


--
-- Name: check_language(jsonb); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.check_language(_column jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_supported_languages text[];
begin
  select enum_range(null::app_private.supported_languages) into v_supported_languages;

  return (
    -- Check that supported_languages exist as top level keys in _column
    select _column ?| v_supported_languages
    -- ...and that _column contains no other top level keys than supported_languages
    and (select v_supported_languages @> array_agg(keys) from jsonb_object_keys(_column) as keys)
  );
end;
$$;


--
-- Name: translated_field; Type: DOMAIN; Schema: app_public; Owner: -
--

CREATE DOMAIN app_public.translated_field AS jsonb
	CONSTRAINT translated_field_check CHECK (app_public.check_language(VALUE));


--
-- Name: DOMAIN translated_field; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON DOMAIN app_public.translated_field IS 'A translated field.';


--
-- Name: create_event_questions; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.create_event_questions AS (
	"position" smallint,
	type app_public.question_type,
	label app_public.translated_field,
	is_required boolean,
	data app_public.translated_field[],
	prefill app_public.question_prefill
);


--
-- Name: create_event_quotas; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.create_event_quotas AS (
	"position" smallint,
	title jsonb,
	size smallint,
	price_cents integer
);


--
-- Name: email; Type: DOMAIN; Schema: app_public; Owner: -
--

CREATE DOMAIN app_public.email AS public.citext
	CONSTRAINT email_check CHECK ((VALUE OPERATOR(public.~) '[^@]+@[^@]+\.[^@]+'::public.citext));


--
-- Name: payment_mode; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.payment_mode AS ENUM (
    'NONE',
    'DURING_REGISTRATION',
    'AFTER_REGISTRATION'
);


--
-- Name: TYPE payment_mode; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TYPE app_public.payment_mode IS 'When an event collects payment: not at all, right after registering, or once registration has closed.';


--
-- Name: event_input; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.event_input AS (
	slug public.citext,
	name app_public.translated_field,
	description jsonb,
	location text,
	event_start_time timestamp with time zone,
	event_end_time timestamp with time zone,
	registration_start_time timestamp with time zone,
	registration_end_time timestamp with time zone,
	is_highlighted boolean,
	is_draft boolean,
	header_image_file text,
	open_quota_size smallint,
	owner_organization_id uuid,
	category_id uuid,
	highlight_text app_public.translated_field,
	payment_mode app_public.payment_mode,
	send_unpaid_email_on_close boolean
);


--
-- Name: event_payment_summary; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.event_payment_summary AS (
	paid_count integer,
	unpaid_count integer,
	due_count integer,
	tickets_paid_cents integer,
	guild_receives_cents integer
);


--
-- Name: TYPE event_payment_summary; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TYPE app_public.event_payment_summary IS 'Payment totals for an event, for organizers.';


--
-- Name: feature_state; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.feature_state AS ENUM (
    'off',
    'admins_only',
    'on'
);


--
-- Name: TYPE feature_state; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TYPE app_public.feature_state IS 'State of a feature flag: off for everyone, on for signed-in admins only, or on for everyone.';


--
-- Name: hex_color; Type: DOMAIN; Schema: app_public; Owner: -
--

CREATE DOMAIN app_public.hex_color AS text
	CONSTRAINT hex_color_check CHECK ((VALUE ~* '^#[a-f0-9]{6}$'::text));


--
-- Name: payment_method; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.payment_method AS ENUM (
    'STRIPE',
    'MANUAL'
);


--
-- Name: TYPE payment_method; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TYPE app_public.payment_method IS 'How a payment was made: by card through Stripe Checkout, or marked paid by an organizer (cash, bank transfer).';


--
-- Name: payment_status; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.payment_status AS ENUM (
    'PENDING',
    'PAID',
    'EXPIRED',
    'REFUNDED'
);


--
-- Name: TYPE payment_status; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TYPE app_public.payment_status IS 'State of a single payment attempt.';


--
-- Name: registration_payment_status; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.registration_payment_status AS ENUM (
    'NOT_REQUIRED',
    'UNPAID',
    'PAID',
    'PAID_MANUALLY',
    'REFUNDED'
);


--
-- Name: TYPE registration_payment_status; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TYPE app_public.registration_payment_status IS 'Payment state of a registration as shown to organizers.';


--
-- Name: registration_status; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.registration_status AS ENUM (
    'IN_QUOTA',
    'IN_QUEUE',
    'IN_OPEN_QUOTA'
);


--
-- Name: update_event_questions; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.update_event_questions AS (
	id uuid,
	"position" smallint,
	type app_public.question_type,
	label app_public.translated_field,
	is_required boolean,
	data app_public.translated_field[],
	prefill app_public.question_prefill
);


--
-- Name: update_event_quotas; Type: TYPE; Schema: app_public; Owner: -
--

CREATE TYPE app_public.update_event_quotas AS (
	id uuid,
	"position" smallint,
	title jsonb,
	size smallint,
	price_cents integer
);


--
-- Name: backfill_registration_prices(uuid); Type: FUNCTION; Schema: app_hidden; Owner: -
--

CREATE FUNCTION app_hidden.backfill_registration_prices(event_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: FUNCTION backfill_registration_prices(event_id uuid); Type: COMMENT; Schema: app_hidden; Owner: -
--

COMMENT ON FUNCTION app_hidden.backfill_registration_prices(event_id uuid) IS 'Sets price_cents from the quota price on finished registrations of a paid event that have no price yet. Returns the number of registrations updated.';


--
-- Name: assert_valid_password(text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.assert_valid_password(new_password text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  -- TODO: add better assertions!
  if length(new_password) < 8 then
    raise exception 'Password is too weak' using errcode = 'WEAKP';
  end if;
end;
$$;


--
-- Name: connect_telegram(text, bigint, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.connect_telegram(token text, chat_id bigint, username text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
#variable_conflict use_variable
declare
  v_user uuid;
begin
  if chat_id is null or chat_id <= 0 then return false; end if;
  delete from app_private.telegram_link_tokens t
    where t.token_hash = public.digest(token, 'sha256') and t.expires_at > clock_timestamp()
    returning t.user_id into v_user;
  if v_user is null then return false; end if;
  -- Do not silently move somebody else's Telegram chat to another account.
  if exists(select 1 from app_public.telegram_accounts a where a.chat_id = chat_id and a.user_id <> v_user) then
    return false;
  end if;
  insert into app_public.telegram_accounts(user_id, chat_id, username)
    values(v_user, chat_id, username)
    on conflict (user_id) do update set chat_id = excluded.chat_id, username = excluded.username;
  return true;
end;
$$;


--
-- Name: current_user_can_manage_event_payments(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.current_user_can_manage_event_payments(event_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select app_public.current_user_is_admin()
    or app_public.current_user_has_event_permissions(event_id);
$$;


--
-- Name: FUNCTION current_user_can_manage_event_payments(event_id uuid); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.current_user_can_manage_event_payments(event_id uuid) IS 'True if the current user may see and manage payments of the event: admins and members of the event''s owner organization.';


--
-- Name: delete_registration_without_refund(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.delete_registration_without_refund(registration_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_previous_setting text := current_setting('ilmo.refund_deleted_registrations', true);
  v_registration_id uuid;
begin
  perform set_config('ilmo.refund_deleted_registrations', 'off', true);

  delete from app_public.registrations r
    where r.id = delete_registration_without_refund.registration_id
    returning r.id into v_registration_id;

  perform set_config('ilmo.refund_deleted_registrations', coalesce(v_previous_setting, ''), true);

  return v_registration_id;
end;
$$;


--
-- Name: FUNCTION delete_registration_without_refund(registration_id uuid); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.delete_registration_without_refund(registration_id uuid) IS 'Deletes a registration without queueing a refund for its card payment. Returns the deleted registration''s id.';


--
-- Name: disconnect_telegram(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.disconnect_telegram(target_user uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  delete from app_public.event_registration_reminders where user_id = target_user and delivery_method = 'telegram' and sent_at is null;
  update app_public.event_registration_reminders set delivery_method = 'email', sent_at = email_sent_at
    where user_id = target_user and delivery_method = 'both' and sent_at is null;
  delete from app_private.telegram_link_tokens where user_id = target_user;
  delete from app_public.telegram_accounts where user_id = target_user;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username public.citext NOT NULL,
    name text,
    avatar_url text,
    is_admin boolean DEFAULT false NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_developer boolean DEFAULT false NOT NULL,
    first_name text,
    last_name text,
    CONSTRAINT users_avatar_url_check CHECK ((avatar_url ~ '^https?://[^/]+'::text)),
    CONSTRAINT users_username_check CHECK (((length((username)::text) >= 2) AND (length((username)::text) <= 24) AND (username OPERATOR(public.~) '^[a-zA-Z]([_]?[a-zA-Z0-9])+$'::public.citext)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.users IS 'A user who can log in to the application.';


--
-- Name: COLUMN users.id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.users.id IS 'Unique identifier for the user.';


--
-- Name: COLUMN users.username; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.users.username IS 'Public-facing username (or ''handle'') of the user.';


--
-- Name: COLUMN users.name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.users.name IS 'Public-facing name (or pseudonym) of the user.';


--
-- Name: COLUMN users.avatar_url; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.users.avatar_url IS 'Optional avatar URL.';


--
-- Name: COLUMN users.is_admin; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.users.is_admin IS 'If true, the user has elevated privileges.';


--
-- Name: COLUMN users.is_developer; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.users.is_developer IS 'If true and the user is also an admin, the user can manage feature flags.';


--
-- Name: COLUMN users.first_name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.users.first_name IS 'The user''s first name(s), from the Keycloak `given_name` claim. Null for users that have not logged in with Keycloak.';


--
-- Name: COLUMN users.last_name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.users.last_name IS 'The user''s last name, from the Keycloak `family_name` claim. Null for users that have not logged in with Keycloak.';


--
-- Name: link_or_register_user(uuid, character varying, character varying, json, json); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.link_or_register_user(f_user_id uuid, f_service character varying, f_identifier character varying, f_profile json, f_auth_details json) RETURNS app_public.users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_matched_user_id uuid;
  v_matched_authentication_id uuid;
  v_email citext;
  v_name text;
  v_avatar_url text;
  v_user app_public.users;
  v_user_email app_public.user_emails;
begin
  -- See if a user account already matches these details
  select id, user_id
    into v_matched_authentication_id, v_matched_user_id
    from app_public.user_authentications
    where service = f_service
    and identifier = f_identifier
    limit 1;

  if v_matched_user_id is not null and f_user_id is not null and v_matched_user_id <> f_user_id then
    raise exception 'A different user already has this account linked.' using errcode = 'TAKEN';
  end if;

  v_email = f_profile ->> 'email';
  v_name := f_profile ->> 'name';
  v_avatar_url := f_profile ->> 'avatar_url';

  if v_matched_authentication_id is null then
    if f_user_id is not null then
      -- Link new account to logged in user account
      insert into app_public.user_authentications (user_id, service, identifier, details) values
        (f_user_id, f_service, f_identifier, f_profile) returning id, user_id into v_matched_authentication_id, v_matched_user_id;
      insert into app_private.user_authentication_secrets (user_authentication_id, details) values
        (v_matched_authentication_id, f_auth_details);
      perform graphile_worker.add_job(
        'user__audit',
        json_build_object(
          'type', 'linked_account',
          'user_id', f_user_id,
          'extra1', f_service,
          'extra2', f_identifier,
          'current_user_id', app_public.current_user_id()
        ));
    elsif v_email is not null then
      -- See if the email is registered
      select * into v_user_email from app_public.user_emails where email = v_email and is_verified is true;
      if v_user_email is not null then
        -- User exists!
        insert into app_public.user_authentications (user_id, service, identifier, details) values
          (v_user_email.user_id, f_service, f_identifier, f_profile) returning id, user_id into v_matched_authentication_id, v_matched_user_id;
        insert into app_private.user_authentication_secrets (user_authentication_id, details) values
          (v_matched_authentication_id, f_auth_details);
        perform graphile_worker.add_job(
          'user__audit',
          json_build_object(
            'type', 'linked_account',
            'user_id', f_user_id,
            'extra1', f_service,
            'extra2', f_identifier,
            'current_user_id', app_public.current_user_id()
          ));
      end if;
    end if;
  end if;
  if v_matched_user_id is null and f_user_id is null and v_matched_authentication_id is null then
    -- Create and return a new user account
    return app_private.register_user(f_service, f_identifier, f_profile, f_auth_details, true);
  else
    if v_matched_authentication_id is not null then
      update app_public.user_authentications
        set details = f_profile
        where id = v_matched_authentication_id;
      update app_private.user_authentication_secrets
        set details = f_auth_details
        where user_authentication_id = v_matched_authentication_id;
      update app_public.users
        set
          name = coalesce(users.name, v_name),
          avatar_url = coalesce(users.avatar_url, v_avatar_url)
        where id = v_matched_user_id
        returning  * into v_user;
      return v_user;
    else
      -- v_matched_authentication_id is null
      -- -> v_matched_user_id is null (they're paired)
      -- -> f_user_id is not null (because the if clause above)
      -- -> v_matched_authentication_id is not null (because of the separate if block above creating a user_authentications)
      -- -> contradiction.
      raise exception 'This should not occur';
    end if;
  end if;
end;
$$;


--
-- Name: FUNCTION link_or_register_user(f_user_id uuid, f_service character varying, f_identifier character varying, f_profile json, f_auth_details json); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.link_or_register_user(f_user_id uuid, f_service character varying, f_identifier character varying, f_profile json, f_auth_details json) IS 'If you''re logged in, this will link an additional OAuth login to your account if necessary. If you''re logged out it may find if an account already exists (based on OAuth details or email address) and return that, or create a new user account if necessary.';


--
-- Name: sessions; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.sessions (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'web'::text NOT NULL,
    oauth_sid text,
    CONSTRAINT sessions_kind_check CHECK ((kind = ANY (ARRAY['web'::text, 'mcp'::text]))),
    CONSTRAINT sessions_oauth_sid_check CHECK (((kind = 'mcp'::text) = (oauth_sid IS NOT NULL)))
);


--
-- Name: COLUMN sessions.kind; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON COLUMN app_private.sessions.kind IS 'How the session was established: web (session cookie) or mcp (Keycloak access token on /mcp).';


--
-- Name: COLUMN sessions.oauth_sid; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON COLUMN app_private.sessions.oauth_sid IS 'Keycloak session id (the access token sid claim) of an mcp session.';


--
-- Name: login(public.citext, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.login(username public.citext, password text) RETURNS app_private.sessions
    LANGUAGE plpgsql STRICT
    AS $$
declare
  v_user app_public.users;
  v_user_secret app_private.user_secrets;
  v_login_attempt_window_duration interval = interval '5 minutes';
  v_session app_private.sessions;
begin
  if username like '%@%' then
    -- It's an email
    select users.* into v_user
    from app_public.users
    inner join app_public.user_emails
    on (user_emails.user_id = users.id)
    where user_emails.email = login.username
    order by
      user_emails.is_verified desc, -- Prefer verified email
      user_emails.created_at asc -- Failing that, prefer the first registered (unverified users _should_ verify before logging in)
    limit 1;
  else
    -- It's a username
    select users.* into v_user
    from app_public.users
    where users.username = login.username;
  end if;

  if not (v_user is null) then
    -- Load their secrets
    select * into v_user_secret from app_private.user_secrets
    where user_secrets.user_id = v_user.id;

    -- Have there been too many login attempts?
    if (
      v_user_secret.first_failed_password_attempt is not null
    and
      v_user_secret.first_failed_password_attempt > NOW() - v_login_attempt_window_duration
    and
      v_user_secret.failed_password_attempts >= 3
    ) then
      raise exception 'User account locked - too many login attempts. Try again after 5 minutes.' using errcode = 'LOCKD';
    end if;

    -- Not too many login attempts, let's check the password.
    -- NOTE: `password_hash` could be null, this is fine since `NULL = NULL` is null, and null is falsy.
    if v_user_secret.password_hash = crypt(password, v_user_secret.password_hash) then
      -- Excellent - they're logged in! Let's reset the attempt tracking
      update app_private.user_secrets
      set failed_password_attempts = 0, first_failed_password_attempt = null, last_login_at = now()
      where user_id = v_user.id;
      -- Create a session for the user
      insert into app_private.sessions (user_id) values (v_user.id) returning * into v_session;
      -- And finally return the session
      return v_session;
    else
      -- Wrong password, bump all the attempt tracking figures
      update app_private.user_secrets
      set
        failed_password_attempts = (case when first_failed_password_attempt is null or first_failed_password_attempt < now() - v_login_attempt_window_duration then 1 else failed_password_attempts + 1 end),
        first_failed_password_attempt = (case when first_failed_password_attempt is null or first_failed_password_attempt < now() - v_login_attempt_window_duration then now() else first_failed_password_attempt end)
      where user_id = v_user.id;
      return null; -- Must not throw otherwise transaction will be aborted and attempts won't be recorded
    end if;
  else
    -- No user with that email/username was found
    return null;
  end if;
end;
$$;


--
-- Name: FUNCTION login(username public.citext, password text); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.login(username public.citext, password text) IS 'Returns a user that matches the username/password combo, or null on failure.';


--
-- Name: really_create_user(public.citext, text, text, text, text, boolean, boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.really_create_user(username public.citext, email text, name text, avatar_url text, password text DEFAULT NULL::text, email_is_verified boolean DEFAULT false, is_admin boolean DEFAULT false) RETURNS app_public.users
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user app_public.users;
  v_username citext = username;
begin
  if password is not null then
    perform app_private.assert_valid_password(password);
  end if;
  if email is null then
    raise exception 'Email is required' using errcode = 'MODAT';
  end if;

  -- Insert the new user
  insert into app_public.users (username, name, avatar_url, is_admin) values
    (v_username, name, avatar_url, is_admin)
    returning * into v_user;

	-- Add the user's email
  insert into app_public.user_emails (user_id, email, is_verified, is_primary)
  values (v_user.id, email, email_is_verified, email_is_verified);

  -- Store the password
  if password is not null then
    update app_private.user_secrets
    set password_hash = crypt(password, gen_salt('bf'))
    where user_id = v_user.id;
  end if;

  -- Refresh the user
  select * into v_user from app_public.users where id = v_user.id;

  return v_user;
end;
$$;


--
-- Name: FUNCTION really_create_user(username public.citext, email text, name text, avatar_url text, password text, email_is_verified boolean, is_admin boolean); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.really_create_user(username public.citext, email text, name text, avatar_url text, password text, email_is_verified boolean, is_admin boolean) IS 'Creates a user account. All arguments are optional, it trusts the calling method to perform sanitisation.';


--
-- Name: refresh_registration_positions(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.refresh_registration_positions(p_event_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_queued uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('registration_positions:' || p_event_id::text));

  select coalesce(array_agg(id), '{}')
    into v_queued
    from app_hidden.registrations_status_and_position
    where event_id = p_event_id and status = 'IN_QUEUE'::app_public.registration_status;

  delete from app_hidden.registrations_status_and_position
    where event_id = p_event_id;

  insert into app_hidden.registrations_status_and_position(id, event_id, quota_id, status, position)
    with cte1 as (
      select
        r.id,
        size,
        r.event_id,
        r.quota_id,
        e.open_quota_size,
        r.created_at,
        row_number() over (partition by r.quota_id order by r.created_at asc) as tmp_pos_quota
      from app_public.registrations r
      left join app_public.quotas q
        on r.quota_id = q.id
      left join app_public.events e
        on r.event_id = e.id
      where r.event_id = p_event_id
    ), cte2 as (
      select
        tmp.*,
        row_number() over (partition by event_id, tmp_status order by created_at asc) as tmp_pos_status
      from (
        select
          *,
          case
            when tmp_pos_quota <= size then 'IN_QUOTA'::text
            else 'OPEN_OR_QUEUE'::text
          end as tmp_status
        from cte1
      ) as tmp
    ), cte3 as (
      select
        *,
        case
          when tmp_status = 'OPEN_OR_QUEUE'::text and tmp_pos_status <= open_quota_size then 'IN_OPEN_QUOTA'::app_public.registration_status
          when tmp_status = 'OPEN_OR_QUEUE'::text then 'IN_QUEUE'::app_public.registration_status
          else 'IN_QUOTA'::app_public.registration_status
        end as status
      from cte2
    ) select
        id,
        event_id,
        quota_id,
        status,
        case
          -- row_number() returns bigint but we cast it to integer to avoid
          -- introducing another type to our GraphQL API. Besides, we are not
          -- expecting to have that many registrations in the system.
          when status = 'IN_QUOTA'::app_public.registration_status then cast(row_number() over (partition by quota_id, status order by created_at asc) as integer)
          else cast(row_number() over (partition by event_id, status order by created_at asc) as integer)
        end as position
      from cte3;

  perform graphile_worker.add_job(
    'registration__process_queue',
    json_build_object('receivedSpot', received_spot)
  )
  from app_hidden.registrations_status_and_position received_spot
  join app_public.registrations r on r.id = received_spot.id
  where
    received_spot.event_id = p_event_id and
    received_spot.id = any(v_queued) and
    received_spot.status <> 'IN_QUEUE'::app_public.registration_status and
    r.is_finished;
end;
$$;


--
-- Name: FUNCTION refresh_registration_positions(p_event_id uuid); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.refresh_registration_positions(p_event_id uuid) IS 'Recomputes app_hidden.registrations_status_and_position for the registrations of one event.';


--
-- Name: register_user(character varying, character varying, json, json, boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.register_user(f_service character varying, f_identifier character varying, f_profile json, f_auth_details json, f_email_is_verified boolean DEFAULT false) RETURNS app_public.users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user app_public.users;
  v_email citext;
  v_name text;
  v_username citext;
  v_avatar_url text;
  v_user_authentication_id uuid;
begin
  -- Extract data from the user’s OAuth profile data.
  v_email := f_profile ->> 'email';
  v_name := f_profile ->> 'name';
  v_username := f_profile ->> 'username';
  v_avatar_url := f_profile ->> 'avatar_url';

  -- Sanitise the username, and make it unique if necessary.
  if v_username is null then
    v_username = coalesce(v_name, 'user');
  end if;
  v_username = regexp_replace(v_username, '^[^a-z]+', '', 'gi');
  v_username = regexp_replace(v_username, '[^a-z0-9]+', '_', 'gi');
  if v_username is null or length(v_username) < 3 then
    v_username = 'user';
  end if;
  select (
    case
    when i = 0 then v_username
    else v_username || i::text
    end
  ) into v_username from generate_series(0, 1000) i
  where not exists(
    select 1
    from app_public.users
    where users.username = (
      case
      when i = 0 then v_username
      else v_username || i::text
      end
    )
  )
  limit 1;

  -- Create the user account
  v_user = app_private.really_create_user(
    username => v_username,
    email => v_email,
    name => v_name,
    avatar_url => v_avatar_url,
    email_is_verified => f_email_is_verified
  );

  -- Insert the user’s private account data (e.g. OAuth tokens)
  insert into app_public.user_authentications (user_id, service, identifier, details) values
    (v_user.id, f_service, f_identifier, f_profile) returning id into v_user_authentication_id;
  insert into app_private.user_authentication_secrets (user_authentication_id, details) values
    (v_user_authentication_id, f_auth_details);

  return v_user;
end;
$$;


--
-- Name: FUNCTION register_user(f_service character varying, f_identifier character varying, f_profile json, f_auth_details json, f_email_is_verified boolean); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.register_user(f_service character varying, f_identifier character varying, f_profile json, f_auth_details json, f_email_is_verified boolean) IS 'Used to register a user from information gleaned from OAuth. Primarily used by link_or_register_user';


--
-- Name: registrations; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    quota_id uuid NOT NULL,
    first_name app_public.constrained_name,
    last_name app_public.constrained_name,
    email app_public.email,
    answers jsonb,
    is_finished boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_cents integer
);


--
-- Name: TABLE registrations; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.registrations IS 'Main table for registrations.';


--
-- Name: COLUMN registrations.id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.id IS 'Unique identifier for the registration.';


--
-- Name: COLUMN registrations.event_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.event_id IS 'Identifier of a related event.';


--
-- Name: COLUMN registrations.quota_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.quota_id IS 'Identifier of a related quota.';


--
-- Name: COLUMN registrations.first_name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.first_name IS 'First name of the person registered to an event.';


--
-- Name: COLUMN registrations.last_name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.last_name IS 'Last name of the person registered to an event.';


--
-- Name: COLUMN registrations.email; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.email IS '@omit
Email address of the person registered to an event.';


--
-- Name: COLUMN registrations.answers; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.answers IS 'Answers to event questions.';


--
-- Name: COLUMN registrations.is_finished; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.is_finished IS 'True if the registration is completed succesfully.';


--
-- Name: COLUMN registrations.price_cents; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registrations.price_cents IS 'Ticket price in cents at the time of registering (a snapshot of the quota price). Null when no payment applies.';


--
-- Name: registration_payment_status(app_public.registrations); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.registration_payment_status(registration app_public.registrations) RETURNS app_public.registration_payment_status
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: FUNCTION registration_payment_status(registration app_public.registrations); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.registration_payment_status(registration app_public.registrations) IS 'Payment status of the registration, without a permission check.';


--
-- Name: reset_password(uuid, text, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.reset_password(user_id uuid, reset_token text, new_password text) RETURNS boolean
    LANGUAGE plpgsql STRICT
    AS $$
declare
  v_user app_public.users;
  v_user_secret app_private.user_secrets;
  v_token_max_duration interval = interval '3 days';
begin
  select users.* into v_user
  from app_public.users
  where id = user_id;

  if not (v_user is null) then
    -- Load their secrets
    select * into v_user_secret from app_private.user_secrets
    where user_secrets.user_id = v_user.id;

    -- Have there been too many reset attempts?
    if (
      v_user_secret.first_failed_reset_password_attempt is not null
    and
      v_user_secret.first_failed_reset_password_attempt > NOW() - v_token_max_duration
    and
      v_user_secret.failed_reset_password_attempts >= 20
    ) then
      raise exception 'Password reset locked - too many reset attempts' using errcode = 'LOCKD';
    end if;

    -- Not too many reset attempts, let's check the token
    if v_user_secret.reset_password_token = reset_token then
      -- Excellent - they're legit
      perform app_private.assert_valid_password(new_password);
      -- Let's reset the password as requested
      update app_private.user_secrets
      set
        password_hash = crypt(new_password, gen_salt('bf')),
        failed_password_attempts = 0,
        first_failed_password_attempt = null,
        reset_password_token = null,
        reset_password_token_generated = null,
        failed_reset_password_attempts = 0,
        first_failed_reset_password_attempt = null
      where user_secrets.user_id = v_user.id;
      perform graphile_worker.add_job(
        'user__audit',
        json_build_object(
          'type', 'reset_password',
          'user_id', v_user.id,
          'current_user_id', app_public.current_user_id()
        ));
      return true;
    else
      -- Wrong token, bump all the attempt tracking figures
      update app_private.user_secrets
      set
        failed_reset_password_attempts = (case when first_failed_reset_password_attempt is null or first_failed_reset_password_attempt < now() - v_token_max_duration then 1 else failed_reset_password_attempts + 1 end),
        first_failed_reset_password_attempt = (case when first_failed_reset_password_attempt is null or first_failed_reset_password_attempt < now() - v_token_max_duration then now() else first_failed_reset_password_attempt end)
      where user_secrets.user_id = v_user.id;
      return null;
    end if;
  else
    -- No user with that id was found
    return null;
  end if;
end;
$$;


--
-- Name: schedule_registration_reminder(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.schedule_registration_reminder(reminder_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_due timestamptz;
  v_reminder app_public.event_registration_reminders;
  v_key text := 'registration-reminder:' || reminder_id::text;
begin
  select * into v_reminder from app_public.event_registration_reminders where id = reminder_id;
  select e.registration_start_time - make_interval(mins => v_reminder.minutes_before) into v_due
    from app_public.events e where e.id = v_reminder.event_id
      and v_reminder.sent_at is null and not e.is_draft and e.registration_start_time > now();
  if v_due is not null and v_reminder.delivery_method in ('email', 'both') and v_reminder.email_sent_at is null then
    perform graphile_worker.add_job('reminder__send_registration', json_build_object('id', reminder_id),
      run_at := greatest(now(), v_due), job_key := v_key);
  else
    perform graphile_worker.remove_job(v_key);
  end if;
  if v_due is not null and v_reminder.delivery_method in ('telegram', 'both') and v_reminder.telegram_sent_at is null then
    perform graphile_worker.add_job('reminder__send_telegram', json_build_object('id', reminder_id),
      run_at := greatest(now(), v_due), job_key := v_key || ':telegram', queue_name := 'telegram-reminders');
  else
    perform graphile_worker.remove_job(v_key || ':telegram');
  end if;
end;
$$;


--
-- Name: set_feature_available(text, boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.set_feature_available(key text, available boolean) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  with updated as (
    update app_public.feature_flags as f
    set available = set_feature_available.available
    where f.key = set_feature_available.key
    returning 1
  )
  select exists (select 1 from updated);
$$;


--
-- Name: FUNCTION set_feature_available(key text, available boolean); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.set_feature_available(key text, available boolean) IS 'Records whether the server has the configuration a feature needs. Returns false for an unknown key. Does not change `updated_at`, which tracks state changes.';


--
-- Name: tg__add_audit_job(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg__add_audit_job() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
declare
  v_user_id uuid;
  v_type text = TG_ARGV[0];
  v_user_id_attribute text = TG_ARGV[1];
  v_extra_attribute1 text = TG_ARGV[2];
  v_extra_attribute2 text = TG_ARGV[3];
  v_extra_attribute3 text = TG_ARGV[4];
  v_extra1 text;
  v_extra2 text;
  v_extra3 text;
begin
  if v_user_id_attribute is null then
    raise exception 'Invalid tg__add_audit_job call';
  end if;

  execute 'select ($1.' || quote_ident(v_user_id_attribute) || ')::uuid'
    using (case when TG_OP = 'INSERT' then NEW else OLD end)
    into v_user_id;

  if v_extra_attribute1 is not null then
    execute 'select ($1.' || quote_ident(v_extra_attribute1) || ')::text'
      using (case when TG_OP = 'DELETE' then OLD else NEW end)
      into v_extra1;
  end if;
  if v_extra_attribute2 is not null then
    execute 'select ($1.' || quote_ident(v_extra_attribute2) || ')::text'
      using (case when TG_OP = 'DELETE' then OLD else NEW end)
      into v_extra2;
  end if;
  if v_extra_attribute3 is not null then
    execute 'select ($1.' || quote_ident(v_extra_attribute3) || ')::text'
      using (case when TG_OP = 'DELETE' then OLD else NEW end)
      into v_extra3;
  end if;

  if v_user_id is not null then
    perform graphile_worker.add_job(
      'user__audit',
      json_build_object(
        'type', v_type,
        'user_id', v_user_id,
        'extra1', v_extra1,
        'extra2', v_extra2,
        'extra3', v_extra3,
        'current_user_id', app_public.current_user_id(),
        'schema', TG_TABLE_SCHEMA,
        'table', TG_TABLE_NAME
      ));
  end if;

  return NEW;
end;
$_$;


--
-- Name: FUNCTION tg__add_audit_job(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg__add_audit_job() IS 'For notifying a user that an auditable action has taken place. Call with audit event name, user ID attribute name, and optionally another value to be included (e.g. the PK of the table, or some other relevant information). e.g. `tg__add_audit_job(''added_email'', ''user_id'', ''email'')`';


--
-- Name: tg__add_job(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg__add_job() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  perform graphile_worker.add_job(tg_argv[0], json_build_object('id', NEW.id));
  return NEW;
end;
$$;


--
-- Name: FUNCTION tg__add_job(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg__add_job() IS 'Useful shortcut to create a job on insert/update. Pass the task name as the first trigger argument, and optionally the queue name as the second argument. The record id will automatically be available on the JSON payload.';


--
-- Name: tg__ownership_info(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg__ownership_info() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  NEW.created_by = (case when TG_OP = 'INSERT' then app_public.current_user_id() else OLD.created_by end);
  NEW.updated_by = (case when TG_OP = 'UPDATE' then app_public.current_user_id() else OLD.updated_by end);
  return NEW;
end;
$$;


--
-- Name: FUNCTION tg__ownership_info(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg__ownership_info() IS 'This trigger should be called on all tables with created_by, updated_by - it ensures that they cannot be manipulated.';


--
-- Name: tg__refresh_registration_positions(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg__refresh_registration_positions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if TG_TABLE_NAME = 'events' then
    perform app_private.refresh_registration_positions(coalesce(NEW.id, OLD.id));
    return null;
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    perform app_private.refresh_registration_positions(OLD.event_id);
  end if;
  if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and NEW.event_id is distinct from OLD.event_id) then
    perform app_private.refresh_registration_positions(NEW.event_id);
  end if;
  return null;
end;
$$;


--
-- Name: tg__registration_is_valid(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg__registration_is_valid() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_event app_public.events;
  v_event_signup_open boolean;
  v_required_question_ids uuid[];
begin
  select * into v_event from app_public.events where id = NEW.event_id;
  v_event_signup_open := (select app_public.events_signup_open(v_event));

  if v_event_signup_open is false then
    raise exception 'Event registration is not open.' using errcode = 'DNIED';
  end if;

  v_required_question_ids := array(select id from app_public.event_questions where event_id = NEW.event_id and is_required = TRUE);
  perform app_public.validate_registration_answers(NEW.event_id, v_required_question_ids, NEW.answers);

  return NEW;
end;
$$;


--
-- Name: FUNCTION tg__registration_is_valid(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg__registration_is_valid() IS 'This trigger validates that a registration is valid. That is, the related event is open to registrations.';


--
-- Name: tg__reschedule_registration_reminders(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg__reschedule_registration_reminders() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_id uuid;
begin
  for v_id in select id from app_public.event_registration_reminders
    where event_id = NEW.id and sent_at is null
  loop
    perform app_private.schedule_registration_reminder(v_id);
  end loop;
  return NEW;
end;
$$;


--
-- Name: tg__schedule_registration_reminder(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg__schedule_registration_reminder() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if TG_OP = 'DELETE' then
    perform graphile_worker.remove_job('registration-reminder:' || OLD.id::text);
    perform graphile_worker.remove_job('registration-reminder:' || OLD.id::text || ':telegram');
    return OLD;
  end if;
  perform app_private.schedule_registration_reminder(NEW.id);
  return NEW;
end;
$$;


--
-- Name: tg__timestamps(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg__timestamps() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  NEW.created_at = (case when TG_OP = 'INSERT' then NOW() else OLD.created_at end);
  NEW.updated_at = (case when TG_OP = 'UPDATE' and OLD.updated_at >= NOW() then OLD.updated_at + interval '1 millisecond' else NOW() end);
  return NEW;
end;
$$;


--
-- Name: FUNCTION tg__timestamps(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg__timestamps() IS 'This trigger should be called on all tables with created_at, updated_at - it ensures that they cannot be manipulated and that updated_at will always be larger than the previous updated_at.';


--
-- Name: tg_registrations__queue_payment_refund(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg_registrations__queue_payment_refund() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_payment_id uuid;
begin
  if coalesce(current_setting('ilmo.refund_deleted_registrations', true), '') = 'off' then
    return OLD;
  end if;

  for v_payment_id in
    select p.id
    from app_public.payments as p
    where
      p.registration_id = OLD.id
      and p.status = 'PAID'
      and p.method = 'STRIPE'
  loop
    perform graphile_worker.add_job(
      'payment__refund',
      json_build_object('paymentId', v_payment_id)
    );
  end loop;

  return OLD;
end;
$$;


--
-- Name: FUNCTION tg_registrations__queue_payment_refund(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg_registrations__queue_payment_refund() IS 'Queues payment__refund for the paid Stripe payment of a registration being deleted, unless ilmo.refund_deleted_registrations is ''off'' in this transaction. Manual payments are never refunded by Ilmo.';


--
-- Name: tg_registrations__snapshot_price(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg_registrations__snapshot_price() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if NEW.is_finished is true and (TG_OP = 'INSERT' or OLD.is_finished is not true)
    and app_public.feature_enabled('payments')
  then
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
$$;


--
-- Name: FUNCTION tg_registrations__snapshot_price(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg_registrations__snapshot_price() IS 'Sets registrations.price_cents from the quota price when a registration of a paid event is finished while payments are on.';


--
-- Name: tg_user_email_secrets__insert_with_user_email(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg_user_email_secrets__insert_with_user_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_verification_token text;
begin
  if NEW.is_verified is false then
    v_verification_token = encode(gen_random_bytes(7), 'hex');
  end if;
  insert into app_private.user_email_secrets(user_email_id, verification_token) values(NEW.id, v_verification_token);
  return NEW;
end;
$$;


--
-- Name: FUNCTION tg_user_email_secrets__insert_with_user_email(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg_user_email_secrets__insert_with_user_email() IS 'Ensures that every user_email record has an associated user_email_secret record.';


--
-- Name: tg_user_secrets__insert_with_user(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.tg_user_secrets__insert_with_user() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  insert into app_private.user_secrets(user_id) values(NEW.id);
  return NEW;
end;
$$;


--
-- Name: FUNCTION tg_user_secrets__insert_with_user(); Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON FUNCTION app_private.tg_user_secrets__insert_with_user() IS 'Ensures that every user record has an associated user_secret record.';


--
-- Name: accept_invitation_to_organization(uuid, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.accept_invitation_to_organization(invitation_id uuid, code text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_organization app_public.organizations;
begin
  v_organization = app_public.organization_for_invitation(invitation_id, code);

  -- Accept the user into the organization
  insert into app_public.organization_memberships (organization_id, user_id)
    values(v_organization.id, app_public.current_user_id())
    on conflict do nothing;

  -- Delete the invitation
  delete from app_public.organization_invitations where id = invitation_id;
end;
$$;


--
-- Name: admin_delete_registration(uuid, boolean); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.admin_delete_registration(id uuid, refund boolean DEFAULT true) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_registration_id uuid;
begin
  -- Check permissions
  call app_public.check_is_admin();

  -- Delete registration and associated secrets (foreign key has on delete).
  if coalesce(refund, true) then
    -- The _200_queue_payment_refund trigger refunds the ticket price of a card payment
    delete from app_public.registrations r where r.id = admin_delete_registration.id returning r.id into v_registration_id;
  else
    v_registration_id := app_private.delete_registration_without_refund(admin_delete_registration.id);
  end if;

  if v_registration_id is null then
    raise exception 'Registration was not found.' using errcode = 'NTFND';
  end if;

  return true;
end;
$$;


--
-- Name: FUNCTION admin_delete_registration(id uuid, refund boolean); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.admin_delete_registration(id uuid, refund boolean) IS 'Mutation only accessible to admin users. Allows deleting a registration via the admin panel. In contrast to deleteRegistration, adminDeleteRegistration also allows deleting a registrations once the event signup has closed. If the registration was paid by card and refund is true (the default), the ticket price is refunded; the service fee is not.';


--
-- Name: admin_delete_user(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.admin_delete_user(id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_deleted_count integer;
begin
  -- Check permissions
  call app_public.check_is_admin();

  if admin_delete_user.id = app_public.current_user_id() then
    raise exception 'You may not delete yourself via this page. Please delete your account from the account settings page.' using errcode = 'DNIED';
  end if;

  delete from app_public.users where users.id = admin_delete_user.id;

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 1 then
    return true;
  else
    return false;
  end if;
end;
$$;


--
-- Name: FUNCTION admin_delete_user(id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.admin_delete_user(id uuid) IS 'Delete a user. Only accessible to admin users.';


--
-- Name: admin_list_users(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.admin_list_users() RETURNS SETOF app_public.users
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  -- Check permissions
  -- Cannot use call app_public.check_is_admin(); in a non volatile function
  if not app_public.current_user_is_admin() then
    raise exception 'Acces denied. Only admins are allowed to use this query.' using errcode = 'DNIED';
  end if;

  return query
    select * from app_public.users;
end;
$$;


--
-- Name: FUNCTION admin_list_users(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.admin_list_users() IS '@sortable
@filterable
List all users. Only accessible to admin users.';


--
-- Name: payments; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid,
    event_id uuid,
    quota_id uuid,
    event_name jsonb NOT NULL,
    quota_title jsonb NOT NULL,
    method app_public.payment_method NOT NULL,
    status app_public.payment_status DEFAULT 'PENDING'::app_public.payment_status NOT NULL,
    ticket_amount_cents integer NOT NULL,
    service_fee_cents integer DEFAULT 0 NOT NULL,
    refunded_amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'eur'::text NOT NULL,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    stripe_refund_id text,
    paid_at timestamp with time zone,
    refunded_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_refunded_amount_cents_check CHECK ((refunded_amount_cents >= 0)),
    CONSTRAINT payments_service_fee_cents_check CHECK ((service_fee_cents >= 0)),
    CONSTRAINT payments_ticket_amount_cents_check CHECK ((ticket_amount_cents >= 0))
);


--
-- Name: TABLE payments; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.payments IS '@omit create,update,delete
Payments for registrations. Rows outlive their registration (and event and quota) so they can be reconciled with Stripe payouts; they hold no personal data.';


--
-- Name: COLUMN payments.registration_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.registration_id IS 'The registration paid for. Null once the registration has been deleted.';


--
-- Name: COLUMN payments.event_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.event_id IS 'The event paid for. Null once the event has been deleted.';


--
-- Name: COLUMN payments.quota_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.quota_id IS 'The quota paid for. Null once the quota has been deleted.';


--
-- Name: COLUMN payments.event_name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.event_name IS 'Snapshot of the event name when the payment was created.';


--
-- Name: COLUMN payments.quota_title; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.quota_title IS 'Snapshot of the quota title when the payment was created.';


--
-- Name: COLUMN payments.ticket_amount_cents; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.ticket_amount_cents IS 'Ticket price paid, in cents.';


--
-- Name: COLUMN payments.service_fee_cents; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.service_fee_cents IS 'Service fee paid on top of the ticket, in cents. 0 for manual payments.';


--
-- Name: COLUMN payments.refunded_amount_cents; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.refunded_amount_cents IS 'Amount refunded, in cents.';


--
-- Name: COLUMN payments.created_by; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.payments.created_by IS 'The organizer who recorded a manual payment.';


--
-- Name: admin_mark_registration_paid(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.admin_mark_registration_paid(registration_id uuid) RETURNS app_public.payments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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

  if v_registration.is_finished is not true
    or coalesce(v_registration.price_cents, 0) = 0
    or v_event.payment_mode = 'NONE'
  then
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
$$;


--
-- Name: FUNCTION admin_mark_registration_paid(registration_id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.admin_mark_registration_paid(registration_id uuid) IS 'Records a manual payment (cash, bank transfer) for a registration and emails the participant a payment confirmation.';


--
-- Name: admin_preview_features(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.admin_preview_features() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select f.key
  from app_public.feature_flags as f
  where
    app_public.current_user_is_admin()
    and f.retired_at is null
    and f.available
    and f.state = 'admins_only'
  order by f.key;
$$;


--
-- Name: FUNCTION admin_preview_features(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.admin_preview_features() IS '@simpleCollections only
Keys of the features enabled for the current user only because they are in admins_only. Empty unless the current user is an admin.';


--
-- Name: admin_send_payment_reminders(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.admin_send_payment_reminders(event_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: FUNCTION admin_send_payment_reminders(event_id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.admin_send_payment_reminders(event_id uuid) IS 'Emails a payment reminder to every finished, unpaid registration holding a spot in the event. Returns the number of reminders queued. Refused for 10 minutes after the last reminders were sent.';


--
-- Name: admin_unmark_registration_paid(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.admin_unmark_registration_paid(registration_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: FUNCTION admin_unmark_registration_paid(registration_id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.admin_unmark_registration_paid(registration_id uuid) IS 'Removes a manual payment recorded with adminMarkRegistrationPaid. Card payments cannot be undone this way.';


--
-- Name: admin_update_registration(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.admin_update_registration(id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_registration_secret app_private.registration_secrets;
  v_required_question_ids uuid[];
begin
  -- Check permissions
  call app_public.check_is_admin();

  select * into v_registration_secret
    from app_private.registration_secrets
    where registration_id = admin_update_registration.id;

  if v_registration_secret is null then
    raise exception 'Registration was not found.' using errcode = 'NTFND';
  end if;

  return v_registration_secret.update_token;
end;
$$;


--
-- Name: FUNCTION admin_update_registration(id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.admin_update_registration(id uuid) IS 'Mutation only accessible to admin users. Allows updating a registration via the admin panel.';


--
-- Name: change_password(text, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.change_password(old_password text, new_password text) RETURNS boolean
    LANGUAGE plpgsql STRICT SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user app_public.users;
  v_user_secret app_private.user_secrets;
begin
  select users.* into v_user
  from app_public.users
  where id = app_public.current_user_id();

  if not (v_user is null) then
    -- Load their secrets
    select * into v_user_secret from app_private.user_secrets
    where user_secrets.user_id = v_user.id;

    if v_user_secret.password_hash = crypt(old_password, v_user_secret.password_hash) then
      perform app_private.assert_valid_password(new_password);
      -- Reset the password as requested
      update app_private.user_secrets
      set
        password_hash = crypt(new_password, gen_salt('bf'))
      where user_secrets.user_id = v_user.id;
      perform graphile_worker.add_job(
        'user__audit',
        json_build_object(
          'type', 'change_password',
          'user_id', v_user.id,
          'current_user_id', app_public.current_user_id()
        ));
      return true;
    else
      raise exception 'Incorrect password' using errcode = 'CREDS';
    end if;
  else
    raise exception 'You must log in to change your password' using errcode = 'LOGIN';
  end if;
end;
$$;


--
-- Name: FUNCTION change_password(old_password text, new_password text); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.change_password(old_password text, new_password text) IS 'Enter your old password and a new password to change your password.';


--
-- Name: check_is_admin(); Type: PROCEDURE; Schema: app_public; Owner: -
--

CREATE PROCEDURE app_public.check_is_admin()
    LANGUAGE plpgsql
    AS $$
begin
  if not app_public.current_user_is_admin() then
    raise exception 'Acces denied. Only admins are allowed to use this mutation.' using errcode = 'DNIED';
  end if;
end;
$$;


--
-- Name: check_is_developer(); Type: PROCEDURE; Schema: app_public; Owner: -
--

CREATE PROCEDURE app_public.check_is_developer()
    LANGUAGE plpgsql
    AS $$
begin
  if not app_public.current_user_is_developer() then
    raise exception 'Access denied. Only developers are allowed to use this mutation.' using errcode = 'DNIED';
  end if;
end;
$$;


--
-- Name: check_is_logged_in(text); Type: PROCEDURE; Schema: app_public; Owner: -
--

CREATE PROCEDURE app_public.check_is_logged_in(IN message text)
    LANGUAGE plpgsql
    AS $$
begin
  if app_public.current_user_id() is null then
    raise exception '%', message using errcode = 'LOGIN';
  end if;
end;
$$;


--
-- Name: claim_registration_token(uuid, uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.claim_registration_token(event_id uuid, quota_id uuid) RETURNS app_public.claim_registration_token_output
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  v_output app_public.claim_registration_token_output;
  v_registration_id uuid;
begin
  -- Check that the event exists
  if not exists(
    select 1
    from app_public.events
    where id = claim_registration_token.event_id
  ) then
    raise exception 'Invalid event id.' using errcode = 'NTFND';
  end if;

  -- Check that the quota exists
  if not exists(
    select 1
    from app_public.quotas
    where
      id = claim_registration_token.quota_id
      and event_id = claim_registration_token.event_id
  ) then
    raise exception 'Invalid event or quota id.' using errcode = 'NTFND';
  end if;

  -- Create a registration. This means that a spot in the specified event and
  -- quota is reserved for a user when this function is called. The user can
  -- then proceed to enter their information at their own pace without worrying
  -- that the quota would already be filled by the time they finished.
  insert into app_public.registrations(event_id, quota_id)
    values (event_id, quota_id)
  returning
    id into v_registration_id;

  -- Create a new registration secret
  insert into app_private.registration_secrets(event_id, quota_id, registration_id)
    values (event_id, quota_id, v_registration_id)
  returning
    registration_token, update_token into v_output;

  return v_output;
end;
$$;


--
-- Name: FUNCTION claim_registration_token(event_id uuid, quota_id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.claim_registration_token(event_id uuid, quota_id uuid) IS 'Generates a registration token that must be provided during registration. The token is used to prevent F5-wars.';


--
-- Name: confirm_account_deletion(text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.confirm_account_deletion(token text) RETURNS boolean
    LANGUAGE plpgsql STRICT SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user_secret app_private.user_secrets;
  v_token_max_duration interval = interval '3 days';
begin
  call app_public.check_is_logged_in('You must log in to delete your account');

  select * into v_user_secret
    from app_private.user_secrets
    where user_secrets.user_id = app_public.current_user_id();

  if v_user_secret is null then
    -- Success: they're already deleted
    return true;
  end if;

  -- Check the token
  if (
    -- token is still valid
    v_user_secret.delete_account_token_generated > now() - v_token_max_duration
  and
    -- token matches
    v_user_secret.delete_account_token = token
  ) then
    -- Token passes; delete their account :(
    delete from app_public.users where id = app_public.current_user_id();
    return true;
  end if;

  raise exception 'The supplied token was incorrect - perhaps you''re logged in to the wrong account, or the token has expired?' using errcode = 'DNIED';
end;
$$;


--
-- Name: FUNCTION confirm_account_deletion(token text); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.confirm_account_deletion(token text) IS 'If you''re certain you want to delete your account, use `requestAccountDeletion` to request an account deletion token, and then supply the token through this mutation to complete account deletion.';


--
-- Name: events; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug public.citext NOT NULL,
    name app_public.translated_field NOT NULL,
    description jsonb NOT NULL,
    location text NOT NULL,
    event_start_time timestamp with time zone NOT NULL,
    event_end_time timestamp with time zone NOT NULL,
    registration_start_time timestamp with time zone NOT NULL,
    registration_end_time timestamp with time zone NOT NULL,
    is_highlighted boolean DEFAULT false NOT NULL,
    is_draft boolean DEFAULT true NOT NULL,
    header_image_file text,
    open_quota_size smallint NOT NULL,
    owner_organization_id uuid NOT NULL,
    category_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    highlight_text app_public.translated_field,
    payment_mode app_public.payment_mode DEFAULT 'NONE'::app_public.payment_mode NOT NULL,
    send_unpaid_email_on_close boolean DEFAULT false NOT NULL,
    unpaid_close_email_sent_at timestamp with time zone,
    last_payment_reminder_sent_at timestamp with time zone,
    CONSTRAINT _cnstr_check_event_registration_time CHECK ((registration_start_time < registration_end_time)),
    CONSTRAINT _cnstr_check_event_time CHECK ((event_start_time < event_end_time)),
    CONSTRAINT _cnstr_check_events_after_registration_sends_unpaid_email CHECK (((payment_mode <> 'AFTER_REGISTRATION'::app_public.payment_mode) OR send_unpaid_email_on_close)),
    CONSTRAINT _cnstr_check_events_open_quota_size CHECK ((open_quota_size >= 0)),
    CONSTRAINT _cnstr_check_registration_end_before_event_start CHECK ((registration_end_time < event_start_time))
);


--
-- Name: TABLE events; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.events IS 'Main table for events.';


--
-- Name: COLUMN events.id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.id IS 'Unique identifier for the event.';


--
-- Name: COLUMN events.slug; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.slug IS '@unique
Slug for the event.';


--
-- Name: COLUMN events.name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.name IS 'Name of the event.';


--
-- Name: COLUMN events.description; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.description IS 'Description of the event.';


--
-- Name: COLUMN events.location; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.location IS 'Event location.';


--
-- Name: COLUMN events.event_start_time; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.event_start_time IS 'Starting time of the event.';


--
-- Name: COLUMN events.event_end_time; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.event_end_time IS 'Ending time of the event.';


--
-- Name: COLUMN events.registration_start_time; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.registration_start_time IS 'Time of event registration open.';


--
-- Name: COLUMN events.registration_end_time; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.registration_end_time IS 'Time of event registration end.';


--
-- Name: COLUMN events.is_highlighted; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.is_highlighted IS 'A highlighted event.';


--
-- Name: COLUMN events.is_draft; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.is_draft IS 'A draft event that is not publicly visible.';


--
-- Name: COLUMN events.header_image_file; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.header_image_file IS 'Header image for the event';


--
-- Name: COLUMN events.open_quota_size; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.open_quota_size IS 'Size of the open quota for the event.';


--
-- Name: COLUMN events.owner_organization_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.owner_organization_id IS 'Identifier of the event organizer';


--
-- Name: COLUMN events.category_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.category_id IS 'Identifier of a related event category.';


--
-- Name: COLUMN events.highlight_text; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.highlight_text IS 'Text shown on the ribbon of a highlighted event.';


--
-- Name: COLUMN events.payment_mode; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.payment_mode IS 'When payment is collected for this event. NONE means the event has no payments.';


--
-- Name: COLUMN events.send_unpaid_email_on_close; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.send_unpaid_email_on_close IS 'Email the payment link to unpaid participants holding a spot when registration closes. Always true in AFTER_REGISTRATION mode.';


--
-- Name: COLUMN events.unpaid_close_email_sent_at; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.unpaid_close_email_sent_at IS 'When the close-of-registration payment email was sent. Set once by the worker.';


--
-- Name: COLUMN events.last_payment_reminder_sent_at; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.events.last_payment_reminder_sent_at IS 'When an organizer last sent payment reminders to all unpaid participants.';


--
-- Name: create_event(app_public.event_input, app_public.create_event_quotas[], app_public.create_event_questions[]); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.create_event(event app_public.event_input, quotas app_public.create_event_quotas[], questions app_public.create_event_questions[] DEFAULT NULL::app_public.create_event_questions[]) RETURNS app_public.events
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
    highlight_text,
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
    event.highlight_text,
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
    -- A paid payment mode can be chosen only while payments are on
    if coalesce(event.payment_mode, 'NONE') <> 'NONE' and not app_public.feature_enabled('payments') then
      raise exception 'Payments are not available.' using errcode = 'FTOFF';
    end if;

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
$$;


--
-- Name: FUNCTION create_event(event app_public.event_input, quotas app_public.create_event_quotas[], questions app_public.create_event_questions[]); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.create_event(event app_public.event_input, quotas app_public.create_event_quotas[], questions app_public.create_event_questions[]) IS 'Create an event as well as any related quotas and questions with one mutation.';


--
-- Name: validate_question_data(app_public.question_type, app_public.translated_field[]); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.validate_question_data(type app_public.question_type, data app_public.translated_field[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  err_context text;
begin
  if type = 'TEXT' then
    -- TEXT questions don't need to have any data associated with them
    -- since we simply render an input field. CHECKBOX and RADIO
    -- should have data (the answer options) associated with them.
    if data is null then
      return true;
    end if;

    return false;
  else

    -- Check that the provided jsonb data contains no null values
    perform app_public.validate_jsonb_no_nulls(data);

    -- RADIO and CHECKBOX must have data defined
    if data is null then
      return false;
    end if;

    return true;
  end if;
-- If validate_jsonb_no_nulls raises an exception, return false
exception when others then
  return false;
end;
$$;


--
-- Name: event_questions; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.event_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    "position" smallint NOT NULL,
    type app_public.question_type NOT NULL,
    label app_public.translated_field NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    data app_public.translated_field[],
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    prefill app_public.question_prefill,
    CONSTRAINT _cnstr_prefill_text_only CHECK (((prefill IS NULL) OR (type = 'TEXT'::app_public.question_type))),
    CONSTRAINT _cnstr_validate_question_data CHECK (app_public.validate_question_data(type, data))
);


--
-- Name: TABLE event_questions; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.event_questions IS 'Main table for event questions.';


--
-- Name: COLUMN event_questions.id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_questions.id IS 'Unique identifier for the event question.';


--
-- Name: COLUMN event_questions.event_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_questions.event_id IS 'Identifier of a related event.';


--
-- Name: COLUMN event_questions."position"; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_questions."position" IS 'Question position. Used to order question.';


--
-- Name: COLUMN event_questions.type; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_questions.type IS 'Question type (e.g. radio button, text, checkbox).';


--
-- Name: COLUMN event_questions.label; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_questions.label IS 'Question label.';


--
-- Name: COLUMN event_questions.is_required; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_questions.is_required IS 'If true, the question must be answered during event registration.';


--
-- Name: COLUMN event_questions.data; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_questions.data IS 'Question data.';


--
-- Name: COLUMN event_questions.prefill; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_questions.prefill IS 'Which registration profile field prefills the answer to this question, if any.';


--
-- Name: create_event_questions(uuid, app_public.create_event_questions[]); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.create_event_questions(event_id uuid, questions app_public.create_event_questions[]) RETURNS app_public.event_questions[]
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_input app_public.create_event_questions;
  v_question app_public.event_questions;
  v_ret app_public.event_questions[] default '{}';
begin
  -- Check permissions
  call app_public.check_is_admin();

  if questions is null then
    return null;
  end if;

  -- Create questions
  foreach v_input in array questions loop
    insert into app_public.event_questions(event_id, position, type, label, is_required, data, prefill)
      values (event_id, v_input.position, v_input.type, v_input.label, v_input.is_required, v_input.data, v_input.prefill)
      returning * into v_question;

    v_ret := array_append(v_ret, v_question);
  end loop;

  return v_ret;
end;
$$;


--
-- Name: FUNCTION create_event_questions(event_id uuid, questions app_public.create_event_questions[]); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.create_event_questions(event_id uuid, questions app_public.create_event_questions[]) IS '@omit
Create multiple questions at once.';


--
-- Name: quotas; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.quotas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    "position" smallint NOT NULL,
    title app_public.translated_field NOT NULL,
    size smallint NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_cents integer DEFAULT 0 NOT NULL,
    CONSTRAINT quotas_position_check CHECK (("position" >= 0)),
    CONSTRAINT quotas_price_cents_check CHECK (((price_cents = 0) OR ((price_cents >= 25) AND (price_cents <= 1000000)))),
    CONSTRAINT quotas_size_check CHECK ((size > 0))
);


--
-- Name: TABLE quotas; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.quotas IS 'Main table for registration quotas.';


--
-- Name: COLUMN quotas.event_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.quotas.event_id IS 'Identifier of the event that this quota is for.';


--
-- Name: COLUMN quotas."position"; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.quotas."position" IS 'Quota position. Used to order quotas.';


--
-- Name: COLUMN quotas.title; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.quotas.title IS 'Title for the quota.';


--
-- Name: COLUMN quotas.size; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.quotas.size IS 'Size of the quota.';


--
-- Name: COLUMN quotas.price_cents; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.quotas.price_cents IS 'Ticket price in cents. 0 means the quota is free; a paid price is at least 25 cents so that the total charge with the service fee reaches Stripe''s minimum, and at most 1 000 000 cents (10 000 €).';


--
-- Name: create_event_quotas(uuid, app_public.create_event_quotas[]); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]) RETURNS app_public.quotas[]
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: FUNCTION create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]) IS '@omit
Create multiple quotas at once.';


--
-- Name: organizations; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug public.citext NOT NULL,
    name text NOT NULL,
    color app_public.hex_color,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE organizations; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.organizations IS 'Main table for organizations.';


--
-- Name: COLUMN organizations.id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.organizations.id IS 'Unique identifier for the organization.';


--
-- Name: COLUMN organizations.slug; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.organizations.slug IS 'Name of the event category.';


--
-- Name: COLUMN organizations.name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.organizations.name IS 'Name of the organization.';


--
-- Name: COLUMN organizations.color; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.organizations.color IS 'Color for the organization.';


--
-- Name: create_organization(public.citext, text, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.create_organization(slug public.citext, name text, color text) RETURNS app_public.organizations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_org app_public.organizations;
begin
  -- Check permissions
  call app_public.check_is_admin();

  insert into app_public.organizations (slug, name, color) values (slug, name, color) returning * into v_org;
  insert into app_public.organization_memberships (organization_id, user_id, is_owner)
    values (v_org.id, app_public.current_user_id(), true);
  return v_org;
end;
$$;


--
-- Name: create_registration(text, uuid, uuid, text, text, public.citext, jsonb); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.create_registration("registrationToken" text, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email public.citext, answers jsonb DEFAULT NULL::jsonb) RETURNS app_public.registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_registration app_public.registrations;
  v_registration_id uuid;
  v_quota app_public.quotas;
  v_event app_public.events;
  v_event_signup_open boolean;
  v_required_question_ids uuid[];
begin
  select * into v_quota from app_public.quotas where id = "quotaId";
  select * into v_event from app_public.events where id = "eventId";

  -- If either event or quota are not found, prevent event registration
  if v_quota.id is null then
    raise exception 'Quota not found.' using errcode = 'NTFND';
  end if;

  if v_event.id is null then
    raise exception 'Event not found.' using errcode = 'NTFND';
  end if;

  -- If the registration is not open yet, prevent event registration.
  -- This is double validated in the _200_registration_is_valid trigger.
  v_event_signup_open := (select app_public.events_signup_open(v_event));
  if not v_event_signup_open then
    raise exception 'Event registration is not open.' using errcode = 'DNIED';
  end if;

  -- Get registration id matching registration token
  select registration_id into v_registration_id
  from app_private.registration_secrets
  where registration_token = "registrationToken"
    and event_id = "eventId"
    and quota_id = "quotaId";

  -- If the provided token does not exist or is not valid for the specified event
  -- prevent event registration
  if v_registration_id is null then
    raise exception 'Registration token was not valid. Please reload the page.' using errcode = 'DNIED';
  end if;

  -- If the registration doesn't provide answers to all of the required questions it is invalid.
  -- This is double validated in the _200_registration_is_valid trigger.
  v_required_question_ids := array(select id from app_public.event_questions where event_id = "eventId" and is_required = True);
  perform app_public.validate_registration_answers("eventId", v_required_question_ids, answers);

  -- Update registration that was created by calling claim_registration_token
  update app_public.registrations
    set
      first_name = "firstName",
      last_name = "lastName",
      email = create_registration.email,
      -- strip nulls just in case
      answers = jsonb_strip_nulls(create_registration.answers),
      is_finished = true
    where id = v_registration_id
  returning
    * into v_registration;

  if v_registration.id is null then
    raise exception 'Registration failed. Registration matching token was not found.' using errcode = 'NTFND';
  end if;

  -- Set the used token to null and set registration_id
  update app_private.registration_secrets
    set registration_token = null, registration_id = v_registration.id
    where registration_secrets.registration_token = "registrationToken";

  return v_registration;
exception when unique_violation then
  -- We would like to do the line below but PostgreSQL transaction handling does not
  -- allow it: https://stackoverflow.com/questions/53276032/commit-and-rollback-inside-the-postgres-function
  --
  -- PostgreSQL 11 has procedures which support this use case, but Postgraphile does not support
  -- them and we cannot call a procedure that does a COMMIT or a ROLLBACK from a function:
  --
  -- https://www.postgresql.org/docs/current/plpgsql-transactions.html
  -- https://www.postgresql.org/message-id/d318108f-313f-058b-5670-c4c20132733d%402ndquadrant.com
  --
  -- delete from app_public.registrations where id = v_registration_id;
  --
  -- Instead, we just let the worker task registration__delete_unfinished_registrations
  -- cleanup unfinished registrations after the timeout.
  raise exception 'A registration with email % already exists for this event.', create_registration.email using errcode = 'DNIED';
end;
$$;


--
-- Name: FUNCTION create_registration("registrationToken" text, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email public.citext, answers jsonb); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.create_registration("registrationToken" text, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email public.citext, answers jsonb) IS 'Register to an event. Checks that a valid registration token was suplied.';


--
-- Name: reminder_preferences; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.reminder_preferences (
    user_id uuid NOT NULL,
    minutes_before integer NOT NULL,
    delivery_method text NOT NULL,
    CONSTRAINT reminder_preferences_delivery_method_check CHECK ((delivery_method = ANY (ARRAY['email'::text, 'telegram'::text, 'both'::text]))),
    CONSTRAINT reminder_preferences_minutes_before_check CHECK (((minutes_before >= 1) AND (minutes_before <= 10080)))
);


--
-- Name: TABLE reminder_preferences; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.reminder_preferences IS '@omit create,update,delete
Delivery and timing preferences for upcoming registration reminders.';


--
-- Name: current_reminder_preferences(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_reminder_preferences() RETURNS app_public.reminder_preferences
    LANGUAGE sql STABLE
    AS $$
  select * from app_public.reminder_preferences where user_id = app_public.current_user_id();
$$;


--
-- Name: current_session_id(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_session_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select nullif(pg_catalog.current_setting('jwt.claims.session_id', true), '')::uuid;
$$;


--
-- Name: FUNCTION current_session_id(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.current_session_id() IS 'Handy method to get the current session ID.';


--
-- Name: telegram_accounts; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.telegram_accounts (
    user_id uuid NOT NULL,
    chat_id bigint NOT NULL,
    username text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_accounts_chat_id_check CHECK ((chat_id > 0))
);


--
-- Name: TABLE telegram_accounts; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.telegram_accounts IS '@omit create,update,delete
Telegram accounts linked by their owners.';


--
-- Name: COLUMN telegram_accounts.chat_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.telegram_accounts.chat_id IS '@omit';


--
-- Name: current_telegram_account(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_telegram_account() RETURNS app_public.telegram_accounts
    LANGUAGE sql STABLE
    AS $$
  select * from app_public.telegram_accounts where user_id = app_public.current_user_id();
$$;


--
-- Name: current_user(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public."current_user"() RETURNS app_public.users
    LANGUAGE sql STABLE
    AS $$
  select users.* from app_public.users where id = app_public.current_user_id();
$$;


--
-- Name: FUNCTION "current_user"(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public."current_user"() IS 'The currently logged in user (or null if not logged in).';


--
-- Name: current_user_has_event_permissions(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_user_has_event_permissions(event_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from app_public.organization_memberships
    where
      user_id = app_public.current_user_id()
      and organization_id = (
        select owner_organization_id
        from app_public.events
        where events.id = event_id
      )
  )
$$;


--
-- Name: FUNCTION current_user_has_event_permissions(event_id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.current_user_has_event_permissions(event_id uuid) IS 'Returns true if the current user is a member of the owner organization for the event with the id passed as input, false otherwise.';


--
-- Name: current_user_id(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select user_id from app_private.sessions where uuid = app_public.current_session_id();
$$;


--
-- Name: FUNCTION current_user_id(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.current_user_id() IS 'Handy method to get the current user ID for use in RLS policies, etc; in GraphQL, use `currentUser{id}` instead.';


--
-- Name: current_user_invited_organization_ids(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_user_invited_organization_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select organization_id from app_public.organization_invitations
    where user_id = app_public.current_user_id();
$$;


--
-- Name: current_user_is_admin(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_user_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from app_public.users
    where
      id = app_public.current_user_id()
      and is_admin = true)
$$;


--
-- Name: FUNCTION current_user_is_admin(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.current_user_is_admin() IS 'Returns true if the current user is admin, false otherwise.';


--
-- Name: current_user_is_developer(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_user_is_developer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from app_public.users
    where
      id = app_public.current_user_id()
      and is_admin = true
      and is_developer = true)
$$;


--
-- Name: FUNCTION current_user_is_developer(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.current_user_is_developer() IS 'Returns true if the current user is both an admin and a developer, false otherwise.';


--
-- Name: current_user_is_owner_organization_member(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_user_is_owner_organization_member(owner_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select owner_organization_id in (
    select app_public.current_user_member_organization_ids()
  )
$$;


--
-- Name: FUNCTION current_user_is_owner_organization_member(owner_organization_id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.current_user_is_owner_organization_member(owner_organization_id uuid) IS 'Returns true if the current user is a member of the organization id passed as input, false otherwise.';


--
-- Name: current_user_member_organization_ids(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.current_user_member_organization_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select organization_id from app_public.organization_memberships
    where user_id = app_public.current_user_id();
$$;


--
-- Name: delete_organization(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.delete_organization(organization_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if exists(
    select 1
    from app_public.organization_memberships
    where user_id = app_public.current_user_id()
    and organization_memberships.organization_id = delete_organization.organization_id
    and is_owner is true
  ) then
    delete from app_public.organizations where id = organization_id;
  end if;
end;
$$;


--
-- Name: delete_registration(text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.delete_registration("updateToken" text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
  -- Lock the registration: a concurrent call with the same token waits here and then finds it gone
  select * into v_registration from app_public.registrations where id = v_registration_id for update;
  select * into v_event from app_public.events where id = v_registration.event_id;
  if v_registration.id is null then raise exception 'Registration matching token was not found.' using errcode = 'NTFND'; end if;
  if (v_event is null) or not (select app_public.events_signup_open(v_event)) then
    raise exception 'Deleting a registration after event signup has closed is not allowed. Please contact the event organizers.' using errcode = 'DNIED';
  end if;

  -- Delete registration and associated secrets (foreign key has on delete).
  -- A card payment is always refunded (ticket price only), by the
  -- _200_queue_payment_refund trigger.
  delete from app_public.registrations where id = v_registration_id;

  if not found then
    raise exception 'Registration matching token was not found.' using errcode = 'NTFND';
  end if;

  return true;
end;
$$;


--
-- Name: FUNCTION delete_registration("updateToken" text); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.delete_registration("updateToken" text) IS 'Delete event registration.';


--
-- Name: delete_registration_profile(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.delete_registration_profile() RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user_id uuid := app_public.current_user_id();
begin
  if v_user_id is null then
    raise exception 'You must log in to delete your registration profile' using errcode = 'LOGIN';
  end if;

  delete from app_public.registration_profiles where user_id = v_user_id;
  return found;
end;
$$;


--
-- Name: FUNCTION delete_registration_profile(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.delete_registration_profile() IS 'Delete the values saved to prefill your event registrations.';


--
-- Name: disconnect_telegram(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.disconnect_telegram() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if app_public.current_user_id() is null then
    raise exception 'Sign in to disconnect Telegram.' using errcode = 'LOGIN';
  end if;
  perform app_private.disconnect_telegram(app_public.current_user_id());
  return true;
end;
$$;


--
-- Name: enable_event_reminder(uuid, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.enable_event_reminder(event_id uuid, language text DEFAULT 'fi'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_preferences app_public.reminder_preferences;
begin
  if app_public.current_user_id() is null then
    raise exception 'Sign in to enable reminders.' using errcode = 'LOGIN';
  end if;
  if not app_public.feature_enabled('registration_reminders') then
    raise exception 'Registration reminders are not available.' using errcode = 'FTOFF';
  end if;
  select * into v_preferences from app_public.reminder_preferences where user_id = app_public.current_user_id();
  if not found then
    raise exception 'Set up reminder preferences first.' using errcode = 'CHECK';
  end if;
  return app_public.set_event_registration_reminder(event_id, true, language, v_preferences.minutes_before, v_preferences.delivery_method);
end;
$$;


--
-- Name: enabled_features(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.enabled_features() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select f.key
  from app_public.feature_flags as f
  where app_public.feature_enabled(f.key)
  order by f.key;
$$;


--
-- Name: FUNCTION enabled_features(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.enabled_features() IS '@simpleCollections only
Keys of the features enabled for the current user.';


--
-- Name: events_payment_summary(app_public.events); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.events_payment_summary(e app_public.events) RETURNS app_public.event_payment_summary
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
            -- In numeric, so large amounts can't overflow integer maths
            else floor((1000 * ticket_amount_cents::numeric - 15 * (ticket_amount_cents::numeric + 25)) / 1000 + 0.5)
          end
        ), 0) from paid)::integer
      )::app_public.event_payment_summary
    end;
$$;


--
-- Name: FUNCTION events_payment_summary(e app_public.events); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.events_payment_summary(e app_public.events) IS 'Payment totals for organizers: counts of registrations holding a spot (in quota or open quota) that are paid, unpaid and due, the ticket amount paid and the estimated amount the guild receives. Null unless the current user may manage the event''s payments.';


--
-- Name: events_signup_closed(app_public.events); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.events_signup_closed(e app_public.events) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select now() > e.registration_end_time;
$$;


--
-- Name: FUNCTION events_signup_closed(e app_public.events); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.events_signup_closed(e app_public.events) IS 'Designates whether event signup is closed or not.';


--
-- Name: events_signup_open(app_public.events); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.events_signup_open(e app_public.events) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select now() between e.registration_start_time and e.registration_end_time;
$$;


--
-- Name: FUNCTION events_signup_open(e app_public.events); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.events_signup_open(e app_public.events) IS 'Designates whether event signup is open or not.';


--
-- Name: events_signup_upcoming(app_public.events); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.events_signup_upcoming(e app_public.events) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select now() < e.registration_start_time;
$$;


--
-- Name: FUNCTION events_signup_upcoming(e app_public.events); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.events_signup_upcoming(e app_public.events) IS 'Designates whether event signup is upcoming or not.';


--
-- Name: feature_enabled(text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.feature_enabled(key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from app_public.feature_flags as f
    where
      f.key = feature_enabled.key
      and (
        f.retired_at is not null
        or (
          f.available
          and (
            f.state = 'on'
            or (f.state = 'admins_only' and app_public.current_user_is_admin())
          )
        )
      ))
$$;


--
-- Name: FUNCTION feature_enabled(key text); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.feature_enabled(key text) IS '@omit
True when the feature is enabled for the current user. Unknown keys read as off.';


--
-- Name: feature_flag_events(text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.feature_flag_events(flag_key text DEFAULT NULL::text) RETURNS TABLE(id uuid, key text, old_state app_public.feature_state, new_state app_public.feature_state, actor_id uuid, actor_username text, actor_name text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  -- Cannot use call app_public.check_is_developer(); in a non volatile function
  if not app_public.current_user_is_developer() then
    raise exception 'Access denied. Only developers are allowed to use this query.' using errcode = 'DNIED';
  end if;

  return query
    select e.id, e.key, e.old_state, e.new_state, e.actor, u.username::text, u.name, e.created_at
    from app_private.feature_flag_events as e
    left join app_public.users as u on u.id = e.actor
    where flag_key is null or e.key = flag_key
    order by e.created_at desc, e.id;
end;
$$;


--
-- Name: FUNCTION feature_flag_events(flag_key text); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.feature_flag_events(flag_key text) IS '@simpleCollections only
Feature flag state changes, newest first, optionally for one key. Only accessible to developers.';


--
-- Name: forgot_password(public.citext); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.forgot_password(email public.citext) RETURNS void
    LANGUAGE plpgsql STRICT SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user_email app_public.user_emails;
  v_token text;
  v_token_min_duration_between_emails interval = interval '3 minutes';
  v_token_max_duration interval = interval '3 days';
  v_now timestamptz = clock_timestamp(); -- Function can be called multiple during transaction
  v_latest_attempt timestamptz;
begin
  -- Find the matching user_email:
  select user_emails.* into v_user_email
  from app_public.user_emails
  where user_emails.email = forgot_password.email
  order by is_verified desc, id desc;

  -- If there is no match:
  if v_user_email is null then
    -- This email doesn't exist in the system; trigger an email stating as much.

    -- We do not allow this email to be triggered more than once every 15
    -- minutes, so we need to track it:
    insert into app_private.unregistered_email_password_resets (email, latest_attempt)
      values (forgot_password.email, v_now)
      on conflict on constraint unregistered_email_pkey
      do update
        set latest_attempt = v_now, attempts = unregistered_email_password_resets.attempts + 1
        where unregistered_email_password_resets.latest_attempt < v_now - interval '15 minutes'
      returning latest_attempt into v_latest_attempt;

    if v_latest_attempt = v_now then
      perform graphile_worker.add_job(
        'user__forgot_password_unregistered_email',
        json_build_object('email', forgot_password.email::text)
      );
    end if;

    -- TODO: we should clear out the unregistered_email_password_resets table periodically.

    return;
  end if;

  -- There was a match.
  -- See if we've triggered a reset recently:
  if exists(
    select 1
    from app_private.user_email_secrets
    where user_email_id = v_user_email.id
    and password_reset_email_sent_at is not null
    and password_reset_email_sent_at > v_now - v_token_min_duration_between_emails
  ) then
    -- If so, take no action.
    return;
  end if;

  -- Fetch or generate reset token:
  update app_private.user_secrets
  set
    reset_password_token = (
      case
      when reset_password_token is null or reset_password_token_generated < v_now - v_token_max_duration
      then encode(gen_random_bytes(7), 'hex')
      else reset_password_token
      end
    ),
    reset_password_token_generated = (
      case
      when reset_password_token is null or reset_password_token_generated < v_now - v_token_max_duration
      then v_now
      else reset_password_token_generated
      end
    )
  where user_id = v_user_email.user_id
  returning reset_password_token into v_token;

  -- Don't allow spamming an email:
  update app_private.user_email_secrets
  set password_reset_email_sent_at = v_now
  where user_email_id = v_user_email.id;

  -- Trigger email send:
  perform graphile_worker.add_job(
    'user__forgot_password',
    json_build_object('id', v_user_email.user_id, 'email', v_user_email.email::text, 'token', v_token)
  );

end;
$$;


--
-- Name: FUNCTION forgot_password(email public.citext); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.forgot_password(email public.citext) IS 'If you''ve forgotten your password, give us one of your email addresses and we''ll send you a reset token. Note this only works if you have added an email address!';


--
-- Name: invite_to_organization(uuid, public.citext, public.citext); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.invite_to_organization(organization_id uuid, username public.citext DEFAULT NULL::public.citext, email public.citext DEFAULT NULL::public.citext) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_code text;
  v_user app_public.users;
begin
  -- Check permissions
  call app_public.check_is_admin();

  select * into v_user from app_public.users where users.username = invite_to_organization.username;

  -- Are we the owner of this organization
  if not exists(
    select 1 from app_public.organization_memberships
      where organization_memberships.organization_id = invite_to_organization.organization_id
      and organization_memberships.user_id = app_public.current_user_id()
      and is_owner is true
  ) then
    raise exception 'You''re not the owner of this organization' using errcode = 'DNIED';
  end if;

  if v_user.id is not null and exists(
    select 1 from app_public.organization_memberships
      where organization_memberships.organization_id = invite_to_organization.organization_id
      and organization_memberships.user_id = v_user.id
  ) then
    raise exception 'Cannot invite someone who is already a member' using errcode = 'ISMBR';
  end if;

  if email is not null then
    v_code = encode(gen_random_bytes(7), 'hex');
  end if;

  if v_user.id is not null and not v_user.is_verified then
    raise exception 'The user you attempted to invite has not verified their account' using errcode = 'VRFY2';
  end if;

  if v_user.id is null and email is null then
    raise exception 'Could not find person to invite' using errcode = 'NTFND';
  end if;

  -- Invite the user
  insert into app_public.organization_invitations(organization_id, user_id, email, code)
    values (invite_to_organization.organization_id, v_user.id, email, v_code);
end;
$$;


--
-- Name: logout(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.logout() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  -- Delete the session
  delete from app_private.sessions where uuid = app_public.current_session_id();
  -- Clear the identifier from the transaction
  perform set_config('jwt.claims.session_id', '', true);
end;
$$;


--
-- Name: user_emails; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.user_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT app_public.current_user_id() NOT NULL,
    email app_public.email NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT _cnstr_user_emails_must_be_verified_to_be_primary CHECK (((is_primary IS FALSE) OR (is_verified IS TRUE)))
);


--
-- Name: TABLE user_emails; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.user_emails IS 'Information about a user''s email address.';


--
-- Name: COLUMN user_emails.email; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.user_emails.email IS 'The users email address, in `a@b.c` format.';


--
-- Name: COLUMN user_emails.is_verified; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.user_emails.is_verified IS 'True if the user has is_verified their email address (by clicking the link in the email we sent them, or logging in with a social login provider), false otherwise.';


--
-- Name: make_email_primary(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.make_email_primary(email_id uuid) RETURNS app_public.user_emails
    LANGUAGE plpgsql STRICT SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user_email app_public.user_emails;
begin
  select * into v_user_email from app_public.user_emails where id = email_id and user_id = app_public.current_user_id();
  if v_user_email is null then
    raise exception 'That''s not your email' using errcode = 'DNIED';
    return null;
  end if;
  if v_user_email.is_verified is false then
    raise exception 'You may not make an unverified email primary' using errcode = 'VRFY1';
  end if;
  update app_public.user_emails set is_primary = false where user_id = app_public.current_user_id() and is_primary is true and id <> email_id;
  update app_public.user_emails set is_primary = true where user_id = app_public.current_user_id() and is_primary is not true and id = email_id returning * into v_user_email;
  return v_user_email;
end;
$$;


--
-- Name: FUNCTION make_email_primary(email_id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.make_email_primary(email_id uuid) IS 'Your primary email is where we''ll notify of account events; other emails may be used for discovery or login. Use this when you''re changing your email address.';


--
-- Name: organization_for_invitation(uuid, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.organization_for_invitation(invitation_id uuid, code text DEFAULT NULL::text) RETURNS app_public.organizations
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_invitation app_public.organization_invitations;
  v_organization app_public.organizations;
begin
  if app_public.current_user_id() is null then
    raise exception 'You must log in to accept an invitation' using errcode = 'LOGIN';
  end if;

  select * into v_invitation from app_public.organization_invitations where id = invitation_id;

  if v_invitation is null then
    raise exception 'We could not find that invitation' using errcode = 'NTFND';
  end if;

  if v_invitation.user_id is not null then
    if v_invitation.user_id is distinct from app_public.current_user_id() then
      raise exception 'That invitation is not for you' using errcode = 'DNIED';
    end if;
  else
    if v_invitation.code is distinct from code then
      raise exception 'Incorrect invitation code' using errcode = 'DNIED';
    end if;
  end if;

  select * into v_organization from app_public.organizations where id = v_invitation.organization_id;

  return v_organization;
end;
$$;


--
-- Name: organizations_current_user_is_owner(app_public.organizations); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.organizations_current_user_is_owner(org app_public.organizations) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists(
    select 1
    from app_public.organization_memberships
    where organization_id = org.id
    and user_id = app_public.current_user_id()
    and is_owner is true
  )
$$;


--
-- Name: registration_by_update_token(text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.registration_by_update_token("updateToken" text) RETURNS app_public.registrations
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_registration_id uuid;
  v_registration app_public.registrations;
begin
  select registration_id into v_registration_id
    from app_private.registration_secrets
    where update_token = "updateToken";

  if v_registration_id is null then
    return null;
  end if;

  select * into v_registration
    from app_public.registrations
    where id = v_registration_id;

  return v_registration;
end;
$$;


--
-- Name: FUNCTION registration_by_update_token("updateToken" text); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.registration_by_update_token("updateToken" text) IS 'Get registration by update token.';


--
-- Name: registrations_email(app_public.registrations); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.registrations_email(registration app_public.registrations) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if not app_public.current_user_id() is null then
    if
      app_public.current_user_id() = registration.created_by or
      app_public.current_user_is_admin()
    then
      -- Don't obfuscate email for the user that created the registration
      -- Dont obfuscate email for admin users
      return registration.email;
    else
      return '***';
    end if;
  else
    -- Obfuscate email for logged out users
    return '***';
  end if;
end;
$$;


--
-- Name: FUNCTION registrations_email(registration app_public.registrations); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.registrations_email(registration app_public.registrations) IS 'Email address of the person registered to an event.';


--
-- Name: registrations_full_name(app_public.registrations); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.registrations_full_name(registration app_public.registrations) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select registration.first_name || ' ' || registration.last_name
$$;


--
-- Name: FUNCTION registrations_full_name(registration app_public.registrations); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.registrations_full_name(registration app_public.registrations) IS 'Returns the full name of a registered person.';


--
-- Name: registrations_payment_status(app_public.registrations); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.registrations_payment_status(registration app_public.registrations) RETURNS app_public.registration_payment_status
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select
    case
      when not app_private.current_user_can_manage_event_payments(registration.event_id)
        then null
      else app_private.registration_payment_status(registration)
    end;
$$;


--
-- Name: FUNCTION registrations_payment_status(registration app_public.registrations); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.registrations_payment_status(registration app_public.registrations) IS '@sortable
@filterable
Payment status of the registration. Null unless the current user may manage the event''s payments, because registrations are publicly readable.';


--
-- Name: registrations_position(app_public.registrations); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.registrations_position(registration app_public.registrations) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  select position from app_hidden.registrations_status_and_position where id = registration.id;
$$;


--
-- Name: FUNCTION registrations_position(registration app_public.registrations); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.registrations_position(registration app_public.registrations) IS '@sortable
@filterable
Returns the position of the registration.';


--
-- Name: registrations_status(app_public.registrations); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.registrations_status(registration app_public.registrations) RETURNS app_public.registration_status
    LANGUAGE sql STABLE
    AS $$
  select status from app_hidden.registrations_status_and_position where id = registration.id;
$$;


--
-- Name: FUNCTION registrations_status(registration app_public.registrations); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.registrations_status(registration app_public.registrations) IS '@sortable
@filterable
Returns the status of the registration.';


--
-- Name: remove_from_organization(uuid, uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.remove_from_organization(organization_id uuid, user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_my_membership app_public.organization_memberships;
begin
  select * into v_my_membership
    from app_public.organization_memberships
    where organization_memberships.organization_id = remove_from_organization.organization_id
    and organization_memberships.user_id = app_public.current_user_id();

  if (v_my_membership is null) then
    -- I'm not a member of that organization
    return;
  elsif v_my_membership.is_owner then
    if remove_from_organization.user_id <> app_public.current_user_id() then
      -- Delete it
    else
      -- Need to transfer ownership before I can leave
      return;
    end if;
  elsif v_my_membership.user_id = user_id then
    -- Delete it
  else
    -- Not allowed to delete it
    return;
  end if;

  delete from app_public.organization_memberships
    where organization_memberships.organization_id = remove_from_organization.organization_id
    and organization_memberships.user_id = remove_from_organization.user_id;

end;
$$;


--
-- Name: request_account_deletion(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.request_account_deletion() RETURNS boolean
    LANGUAGE plpgsql STRICT SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user_email app_public.user_emails;
  v_token text;
  v_token_max_duration interval = interval '3 days';
begin
  call app_public.check_is_logged_in('You must log in to delete your account');

  -- Get the email to send account deletion token to
  select * into v_user_email
    from app_public.user_emails
    where user_id = app_public.current_user_id()
    order by is_primary desc, is_verified desc, id desc
    limit 1;

  -- Fetch or generate token
  update app_private.user_secrets
  set
    delete_account_token = (
      case
      when delete_account_token is null or delete_account_token_generated < NOW() - v_token_max_duration
      then encode(gen_random_bytes(7), 'hex')
      else delete_account_token
      end
    ),
    delete_account_token_generated = (
      case
      when delete_account_token is null or delete_account_token_generated < NOW() - v_token_max_duration
      then now()
      else delete_account_token_generated
      end
    )
  where user_id = app_public.current_user_id()
  returning delete_account_token into v_token;

  -- Trigger email send
  perform graphile_worker.add_job('user__send_delete_account_email', json_build_object('email', v_user_email.email::text, 'token', v_token));
  return true;
end;
$$;


--
-- Name: FUNCTION request_account_deletion(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.request_account_deletion() IS 'Begin the account deletion flow by requesting the confirmation email';


--
-- Name: request_telegram_link(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.request_telegram_link() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_user uuid := app_public.current_user_id();
  v_token text := encode(public.gen_random_bytes(24), 'hex');
begin
  if v_user is null then
    raise exception 'Sign in to connect Telegram.' using errcode = 'LOGIN';
  end if;
  if not app_public.feature_enabled('telegram_reminders') then
    raise exception 'Telegram reminders are not available.' using errcode = 'FTOFF';
  end if;
  insert into app_private.telegram_link_tokens(user_id, token_hash, expires_at)
    values(v_user, public.digest(v_token, 'sha256'), now() + interval '15 minutes')
    on conflict (user_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at;
  return v_token;
end;
$$;


--
-- Name: resend_email_verification_code(uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.resend_email_verification_code(email_id uuid) RETURNS boolean
    LANGUAGE plpgsql STRICT SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if exists(
    select 1
    from app_public.user_emails
    where user_emails.id = email_id
    and user_id = app_public.current_user_id()
    and is_verified is false
  ) then
    perform graphile_worker.add_job('user_emails__send_verification', json_build_object('id', email_id));
    return true;
  end if;
  return false;
end;
$$;


--
-- Name: FUNCTION resend_email_verification_code(email_id uuid); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.resend_email_verification_code(email_id uuid) IS 'If you didn''t receive the verification code for this email, we can resend it. We silently cap the rate of resends on the backend, so calls to this function may not result in another email being sent if it has been called recently.';


--
-- Name: save_reminder_preferences(integer, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.save_reminder_preferences(minutes_before integer, delivery_method text) RETURNS app_public.reminder_preferences
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
#variable_conflict use_variable
declare
  v_user uuid := app_public.current_user_id();
  v_preferences app_public.reminder_preferences;
begin
  if v_user is null then
    raise exception 'Sign in to manage reminder preferences.' using errcode = 'LOGIN';
  end if;
  if not app_public.feature_enabled('registration_reminders') then
    raise exception 'Registration reminders are not available.' using errcode = 'FTOFF';
  end if;
  if minutes_before is null or minutes_before not between 1 and 10080
    or delivery_method is null or delivery_method not in ('email', 'telegram', 'both') then
    raise exception 'Choose a delivery method and a lead time between 1 minute and 7 days.' using errcode = 'CHECK';
  end if;
  if delivery_method in ('telegram', 'both') and not app_public.feature_enabled('telegram_reminders') then
    raise exception 'Telegram reminders are not available.' using errcode = 'FTOFF';
  end if;
  if delivery_method in ('telegram', 'both') and not exists(select 1 from app_public.telegram_accounts where user_id = v_user) then
    raise exception 'Connect Telegram before saving Telegram reminders.' using errcode = 'CHECK';
  end if;
  if delivery_method in ('email', 'both') and not exists(select 1 from app_public.user_emails where user_id = v_user and is_primary and is_verified) then
    raise exception 'Verify your primary email before saving reminders.' using errcode = 'EMAIL';
  end if;
  insert into app_public.reminder_preferences as p(user_id, minutes_before, delivery_method)
    values(v_user, minutes_before, delivery_method)
    on conflict(user_id) do update set minutes_before = excluded.minutes_before, delivery_method = excluded.delivery_method
    returning * into v_preferences;
  -- Lock reminders in a stable order before rescheduling them.
  perform 1 from app_public.event_registration_reminders r
    join app_public.events e on e.id = r.event_id
    where r.user_id = v_user and r.sent_at is null and e.registration_start_time > now()
    order by r.id for update of r;
  update app_public.event_registration_reminders r
    set minutes_before = v_preferences.minutes_before,
      delivery_method = v_preferences.delivery_method,
      sent_at = case
        when v_preferences.delivery_method = 'email' then r.email_sent_at
        when v_preferences.delivery_method = 'telegram' then r.telegram_sent_at
        when r.email_sent_at is not null and r.telegram_sent_at is not null
          then greatest(r.email_sent_at, r.telegram_sent_at)
        else null end
    from app_public.events e
    where r.user_id = v_user and r.event_id = e.id
      and r.sent_at is null and e.registration_start_time > now();
  return v_preferences;
end;
$$;


--
-- Name: set_admin_status(uuid, boolean); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.set_admin_status(id uuid, is_admin boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_updated_count integer;
begin
  -- Check permissions
  call app_public.check_is_admin();

  if set_admin_status.id = app_public.current_user_id() then
    raise exception 'You may not change your own admin status via this mutation.' using errcode = 'DNIED';
  end if;

  update app_public.users set is_admin = set_admin_status.is_admin where users.id = set_admin_status.id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count = 1 then
    return true;
  else
    return false;
  end if;
end;
$$;


--
-- Name: FUNCTION set_admin_status(id uuid, is_admin boolean); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.set_admin_status(id uuid, is_admin boolean) IS 'Make an existing user admin. Only accessible to admin users.';


--
-- Name: set_event_registration_reminder(uuid, boolean, text, integer, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.set_event_registration_reminder(event_id uuid, enabled boolean, language text DEFAULT 'fi'::text, minutes_before integer DEFAULT 30, delivery_method text DEFAULT 'email'::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
#variable_conflict use_variable
declare
  v_user uuid := app_public.current_user_id();
begin
  if v_user is null then
    raise exception 'Please sign in to manage reminders.' using errcode = 'LOGIN';
  end if;
  if not enabled then
    delete from app_public.event_registration_reminders r
      where r.user_id = v_user and r.event_id = event_id;
    return false;
  end if;
  if not app_public.feature_enabled('registration_reminders') then
    raise exception 'Registration reminders are not available.' using errcode = 'FTOFF';
  end if;
  if minutes_before is null or minutes_before < 1 or minutes_before > 10080 then
    raise exception 'Choose a reminder between 1 minute and 7 days before opening.' using errcode = 'CHECK';
  end if;
  if language not in ('fi', 'en') or language is null then
    raise exception 'Unsupported reminder language.' using errcode = 'CHECK';
  end if;
  if delivery_method is null or delivery_method not in ('email', 'telegram', 'both') then
    raise exception 'Unsupported delivery method.' using errcode = 'CHECK';
  end if;
  if delivery_method in ('telegram', 'both') and not app_public.feature_enabled('telegram_reminders') then
    raise exception 'Telegram reminders are not available.' using errcode = 'FTOFF';
  end if;
  if delivery_method in ('telegram', 'both') and not exists(select 1 from app_public.telegram_accounts where user_id = v_user) then
    raise exception 'Connect Telegram before enabling Telegram reminders.' using errcode = 'CHECK';
  end if;
  if delivery_method in ('email', 'both') and not exists(select 1 from app_public.user_emails
    where user_id = v_user and is_primary and is_verified) then
    raise exception 'Verify your primary email before enabling reminders.' using errcode = 'EMAIL';
  end if;
  perform 1 from app_public.events e where e.id = event_id
    and not e.is_draft and e.registration_start_time > now() for share;
  if not found then
    raise exception 'Reminders are only available before registration opens.' using errcode = 'CLOSD';
  end if;
  insert into app_public.event_registration_reminders(user_id, event_id, language, minutes_before, delivery_method)
    values (v_user, event_id, language, minutes_before, delivery_method)
    on conflict on constraint event_registration_reminders_user_id_event_id_key do update
      set minutes_before = excluded.minutes_before, language = excluded.language, delivery_method = excluded.delivery_method,
        sent_at = case
          when excluded.delivery_method = 'email' then event_registration_reminders.email_sent_at
          when excluded.delivery_method = 'telegram' then event_registration_reminders.telegram_sent_at
          when event_registration_reminders.email_sent_at is not null and event_registration_reminders.telegram_sent_at is not null
            then greatest(event_registration_reminders.email_sent_at, event_registration_reminders.telegram_sent_at)
          else null end
      where event_registration_reminders.sent_at is null;
  return true;
end;
$$;


--
-- Name: feature_flags; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.feature_flags (
    key text NOT NULL,
    state app_public.feature_state DEFAULT 'off'::app_public.feature_state NOT NULL,
    available boolean DEFAULT true NOT NULL,
    description text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    retired_at timestamp with time zone,
    CONSTRAINT feature_flags_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text))
);


--
-- Name: TABLE feature_flags; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.feature_flags IS 'A feature that can be switched on or off at runtime. Rows are created by migrations.';


--
-- Name: COLUMN feature_flags.key; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.feature_flags.key IS 'Identifier of the feature, as used in code.';


--
-- Name: COLUMN feature_flags.state; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.feature_flags.state IS 'Who the feature is enabled for.';


--
-- Name: COLUMN feature_flags.available; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.feature_flags.available IS 'False when the server lacks the configuration the feature needs; the feature then reads as off whatever its state.';


--
-- Name: COLUMN feature_flags.description; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.feature_flags.description IS 'What the flag gates.';


--
-- Name: COLUMN feature_flags.updated_at; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.feature_flags.updated_at IS 'When the state was last changed.';


--
-- Name: COLUMN feature_flags.updated_by; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.feature_flags.updated_by IS 'Who last changed the state.';


--
-- Name: COLUMN feature_flags.retired_at; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.feature_flags.retired_at IS 'Set when the gates have been removed from code. A retired flag reads as on.';


--
-- Name: set_feature_flag(text, app_public.feature_state); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.set_feature_flag(key text, state app_public.feature_state) RETURNS app_public.feature_flags
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
#variable_conflict use_variable
declare
  v_flag app_public.feature_flags;
  v_old_state app_public.feature_state;
begin
  call app_public.check_is_developer();

  select * into v_flag
  from app_public.feature_flags as f
  where f.key = key
  for update;

  if v_flag.key is null then
    raise exception 'Unknown feature flag "%".', key using errcode = 'NTFND';
  end if;

  if v_flag.retired_at is not null then
    raise exception 'Feature flag "%" is retired and cannot be changed.', key using errcode = 'DNIED';
  end if;

  if state <> 'off' and not v_flag.available then
    raise exception 'Feature flag "%" is not available: the server lacks the configuration it needs.', key using errcode = 'FTUNA';
  end if;

  if v_flag.state = state then
    return v_flag;
  end if;

  v_old_state = v_flag.state;

  update app_public.feature_flags as f
  set
    state = state,
    updated_at = now(),
    updated_by = app_public.current_user_id()
  where f.key = key
  returning * into v_flag;

  insert into app_private.feature_flag_events (key, old_state, new_state, actor)
  values (key, v_old_state, state, app_public.current_user_id());

  return v_flag;
end;
$$;


--
-- Name: FUNCTION set_feature_flag(key text, state app_public.feature_state); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.set_feature_flag(key text, state app_public.feature_state) IS 'Changes the state of an existing feature flag. Only accessible to developers.';


--
-- Name: registration_profiles; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.registration_profiles (
    user_id uuid NOT NULL,
    telegram text,
    dietary_restrictions text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT registration_profiles_dietary_restrictions_check CHECK ((length(dietary_restrictions) <= 1000)),
    CONSTRAINT registration_profiles_telegram_check CHECK ((length(telegram) <= 64))
);


--
-- Name: TABLE registration_profiles; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.registration_profiles IS 'Values used to prefill event registration answers. Only visible to the user themselves.';


--
-- Name: COLUMN registration_profiles.user_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registration_profiles.user_id IS 'The user this registration profile belongs to.';


--
-- Name: COLUMN registration_profiles.telegram; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registration_profiles.telegram IS 'Telegram handle.';


--
-- Name: COLUMN registration_profiles.dietary_restrictions; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.registration_profiles.dietary_restrictions IS 'Dietary restrictions and allergies.';


--
-- Name: set_registration_profile(text, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.set_registration_profile(telegram text DEFAULT NULL::text, dietary_restrictions text DEFAULT NULL::text) RETURNS app_public.registration_profiles
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
#variable_conflict use_variable
declare
  v_user_id uuid := app_public.current_user_id();
  v_profile app_public.registration_profiles;
begin
  if v_user_id is null then
    raise exception 'You must log in to update your registration profile' using errcode = 'LOGIN';
  end if;

  if not app_public.feature_enabled('prefill_answers') then
    raise exception 'Saving registration answers is not enabled' using errcode = 'FTOFF';
  end if;

  insert into app_public.registration_profiles(user_id, telegram, dietary_restrictions)
    values (v_user_id, nullif(trim(telegram), ''), nullif(trim(dietary_restrictions), ''))
  on conflict (user_id) do update
    set
      telegram = case
        when telegram is null then registration_profiles.telegram
        else excluded.telegram
      end,
      dietary_restrictions = case
        when dietary_restrictions is null then registration_profiles.dietary_restrictions
        else excluded.dietary_restrictions
      end
  returning * into v_profile;

  return v_profile;
end;
$$;


--
-- Name: FUNCTION set_registration_profile(telegram text, dietary_restrictions text); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.set_registration_profile(telegram text, dietary_restrictions text) IS 'Set the values used to prefill your event registrations. A null value keeps the saved one and an empty value clears it.';


--
-- Name: supported_languages(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.supported_languages() RETURNS app_private.supported_languages[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select enum_range(null::app_private.supported_languages);
$$;


--
-- Name: FUNCTION supported_languages(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.supported_languages() IS 'Supported languages of the app.';


--
-- Name: tg__graphql_subscription(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.tg__graphql_subscription() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
declare
  v_process_new bool = (TG_OP = 'INSERT' OR TG_OP = 'UPDATE');
  v_process_old bool = (TG_OP = 'UPDATE' OR TG_OP = 'DELETE');
  v_event text = TG_ARGV[0];
  v_topic_template text = TG_ARGV[1];
  v_attribute text = TG_ARGV[2];
  v_record record;
  v_sub text;
  v_topic text;
  v_i int = 0;
  v_last_topic text;
begin
  for v_i in 0..1 loop
    if (v_i = 0) and v_process_new is true then
      v_record = new;
    elsif (v_i = 1) and v_process_old is true then
      v_record = old;
    else
      continue;
    end if;
     if v_attribute is not null then
      execute 'select $1.' || quote_ident(v_attribute)
        using v_record
        into v_sub;
    end if;
    if v_sub is not null then
      v_topic = replace(v_topic_template, '$1', v_sub);
    else
      v_topic = v_topic_template;
    end if;
    if v_topic is distinct from v_last_topic then
      -- This if statement prevents us from triggering the same notification twice
      v_last_topic = v_topic;
      perform pg_notify(v_topic, json_build_object(
        'event', v_event,
        'subject', v_sub,
        'id', v_record.id
      )::text);
    end if;
  end loop;
  return v_record;
end;
$_$;


--
-- Name: FUNCTION tg__graphql_subscription(); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.tg__graphql_subscription() IS 'This function enables the creation of simple focussed GraphQL subscriptions using database triggers. Read more here: https://www.graphile.org/postgraphile/subscriptions/#custom-subscriptions';


--
-- Name: tg_user_emails__forbid_if_verified(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.tg_user_emails__forbid_if_verified() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if exists(select 1 from app_public.user_emails where email = NEW.email and is_verified is true) then
    raise exception 'An account using that email address has already been created.' using errcode='EMTKN';
  end if;
  return NEW;
end;
$$;


--
-- Name: tg_user_emails__prevent_delete_last_email(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.tg_user_emails__prevent_delete_last_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  if exists (
    with remaining as (
      select user_emails.user_id
      from app_public.user_emails
      inner join deleted
      on user_emails.user_id = deleted.user_id
      -- Don't delete last verified email
      where (user_emails.is_verified is true or not exists (
        select 1
        from deleted d2
        where d2.user_id = user_emails.user_id
        and d2.is_verified is true
      ))
      order by user_emails.id asc

      /*
       * Lock this table to prevent race conditions; see:
       * https://www.cybertec-postgresql.com/en/triggers-to-enforce-constraints/
       */
      for update of user_emails
    )
    select 1
    from app_public.users
    where id in (
      select user_id from deleted
      except
      select user_id from remaining
    )
  )
  then
    raise exception 'You must have at least one (verified) email address' using errcode = 'CDLEA';
  end if;

  return null;
end;
$$;


--
-- Name: tg_user_emails__verify_account_on_verified(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.tg_user_emails__verify_account_on_verified() RETURNS trigger
    LANGUAGE plpgsql STRICT SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  update app_public.users set is_verified = true where id = new.user_id and is_verified is false;
  return new;
end;
$$;


--
-- Name: tg_users__deletion_organization_checks_and_actions(); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.tg_users__deletion_organization_checks_and_actions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- Check they're not an organization owner
  if exists(
    select 1
    from app_public.organization_memberships
    where user_id = app_public.current_user_id()
    and is_owner is true
  ) then
    raise exception 'You cannot delete an account until it is not the owner of any organizations.' using errcode = 'OWNER';
  end if;

  return old;
end;
$$;


--
-- Name: transfer_organization_ownership(uuid, uuid); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.transfer_organization_ownership(organization_id uuid, user_id uuid) RETURNS app_public.organizations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
 v_org app_public.organizations;
begin
  if exists(
    select 1
    from app_public.organization_memberships
    where organization_memberships.user_id = app_public.current_user_id()
    and organization_memberships.organization_id = transfer_organization_ownership.organization_id
    and is_owner is true
  ) then
    update app_public.organization_memberships
      set is_owner = true
      where organization_memberships.organization_id = transfer_organization_ownership.organization_id
      and organization_memberships.user_id = transfer_organization_ownership.user_id;
    if found then
      update app_public.organization_memberships
        set is_owner = false
        where organization_memberships.organization_id = transfer_organization_ownership.organization_id
        and organization_memberships.user_id = app_public.current_user_id();

      select * into v_org from app_public.organizations where id = organization_id;
      return v_org;
    end if;
  end if;
  return null;
end;
$$;


--
-- Name: update_event(uuid, app_public.event_input, app_public.update_event_quotas[], app_public.update_event_questions[]); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.update_event(id uuid, event app_public.event_input, quotas app_public.update_event_quotas[], questions app_public.update_event_questions[] DEFAULT NULL::app_public.update_event_questions[]) RETURNS app_public.events
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
      highlight_text = case
        when event.is_highlighted is null then highlight_text
        else event.highlight_text
      end,
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
    -- A paid payment mode can be chosen only while payments are on
    if coalesce(event.payment_mode, 'NONE') <> 'NONE' and not app_public.feature_enabled('payments') then
      raise exception 'Payments are not available.' using errcode = 'FTOFF';
    end if;

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
$$;


--
-- Name: FUNCTION update_event(id uuid, event app_public.event_input, quotas app_public.update_event_quotas[], questions app_public.update_event_questions[]); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.update_event(id uuid, event app_public.event_input, quotas app_public.update_event_quotas[], questions app_public.update_event_questions[]) IS 'Updates an event as well as any related quotas and questions with one mutation. An omitted event attribute keeps its value, except `highlightText`, which is replaced (null clears it) whenever `isHighlighted` is given. A paid `paymentMode`, and a non-zero quota `priceCents`, are refused while payments are off.';


--
-- Name: update_event_questions(uuid, app_public.update_event_questions[]); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.update_event_questions(event_id uuid, questions app_public.update_event_questions[]) RETURNS app_public.event_questions[]
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
#variable_conflict use_variable
declare
  v_question_ids_to_delete uuid[];
  v_input app_public.update_event_questions;
  v_question app_public.event_questions;
  v_ret app_public.event_questions[] default '{}';
begin
  -- Check permissions
  call app_public.check_is_admin();

  select array(
    select id from app_public.event_questions as q
    where q.event_id = event_id
    and q.id not in (select id from unnest(questions) where id is not null)
  )
  into v_question_ids_to_delete;

  -- Delete existing event questions that were not supplied
  -- as input to this function
  delete from app_public.event_questions as q
    where q.id = any(v_question_ids_to_delete);

  foreach v_input in array questions loop
    if exists(select 1 from app_public.event_questions where id = v_input.id) then
      -- Update existing event questions by id
      update app_public.event_questions
        set position = v_input.position, type = v_input.type, label = v_input.label, is_required = v_input.is_required, data = v_input.data, prefill = v_input.prefill
        where id = v_input.id
      returning * into v_question;
    else
      -- Create new questions that didn't exist before
      insert into app_public.event_questions(event_id, position, type, label, is_required, data, prefill)
        values (event_id, v_input.position, v_input.type, v_input.label, v_input.is_required, v_input.data, v_input.prefill)
      returning * into v_question;
    end if;

    v_ret := array_append(v_ret, v_question);
  end loop;

  return v_ret;
end;
$$;


--
-- Name: FUNCTION update_event_questions(event_id uuid, questions app_public.update_event_questions[]); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.update_event_questions(event_id uuid, questions app_public.update_event_questions[]) IS '@omit
Update multiple questions at once.';


--
-- Name: update_event_quotas(uuid, app_public.update_event_quotas[]); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]) RETURNS app_public.quotas[]
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: FUNCTION update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]) IS '@omit
Update multiple quotas at once.';


--
-- Name: update_registration(text, text, text, jsonb); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.update_registration("updateToken" text, "firstName" text, "lastName" text, answers jsonb DEFAULT NULL::jsonb) RETURNS app_public.registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_registration_secret app_private.registration_secrets;
  v_registration app_public.registrations;
  v_event app_public.events;
  v_required_question_ids uuid[];
begin
  select * into v_registration_secret
    from app_private.registration_secrets
    where update_token = "updateToken";

  if v_registration_secret is null then
    raise exception 'Registration matching token was not found.' using errcode = 'NTFND';
  end if;

  select * into v_event from app_public.events where id = v_registration_secret.event_id;

  if not app_public.current_user_is_admin()
    and ((v_event is null) or not (select app_public.events_signup_open(v_event))) then
    raise exception 'Updating a registration after event signup has closed is not allowed. Please contact the event organizers.' using errcode = 'DNIED';
  end if;

  -- If the registration doesn't provide answers to all of the required questions it is invalid.
  -- This is double validated in the _200_registration_is_valid trigger.
  v_required_question_ids := array(select id from app_public.event_questions where event_id = v_registration_secret.event_id and is_required = True);
  perform app_public.validate_registration_answers(v_registration_secret.event_id, v_required_question_ids, answers);

  update app_public.registrations
    set first_name = "firstName", last_name = "lastName", answers = update_registration.answers
    where id = v_registration_secret.registration_id
  returning
    * into v_registration;

  return v_registration;
end;
$$;


--
-- Name: FUNCTION update_registration("updateToken" text, "firstName" text, "lastName" text, answers jsonb); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.update_registration("updateToken" text, "firstName" text, "lastName" text, answers jsonb) IS 'Update event registration. Checks that a valid update token was suplied.';


--
-- Name: users_has_password(app_public.users); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.users_has_password(u app_public.users) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select (password_hash is not null) from app_private.user_secrets where user_secrets.user_id = u.id and u.id = app_public.current_user_id();
$$;


--
-- Name: users_primary_email(app_public.users); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.users_primary_email(u app_public.users) RETURNS public.citext
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select email
    from app_public.user_emails
    where
      user_emails.user_id = u.id
      and u.id = app_public.current_user_id()
      and user_emails.is_primary = true;
$$;


--
-- Name: FUNCTION users_primary_email(u app_public.users); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.users_primary_email(u app_public.users) IS 'Users primary email.';


--
-- Name: validate_jsonb_no_nulls(anyelement); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.validate_jsonb_no_nulls(input anyelement) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  value jsonb;
begin
  -- SQL null and JSONB null's are different so we have to use jsonb_typeof()
  -- More information: http://mbork.pl/2020-02-15_PostgreSQL_and_null_values_in_jsonb

  if jsonb_typeof(to_jsonb(input)) = 'null' then
    -- JSON null provided, invalid
    raise exception 'Invalid json data' using errcode = 'JSONN';
  elsif jsonb_typeof(to_jsonb(input)) = 'array' then
    -- jsonb_strip_nulls omits all object fields that have null values
    if jsonb_array_length(jsonb_strip_nulls(to_jsonb(input))) < 1 then
      -- Empty json '{}' provided, invalid
      raise exception 'Invalid json data' using errcode = 'JSONN';
    else
      -- Loop jsonb list to see if there are any JSON null's. If there are, raise exception.
      for value in select jsonb_array_elements from jsonb_array_elements(to_jsonb(input)) loop
        if jsonb_typeof(to_jsonb(value)) = 'null' then
          -- JSON null found in list, invalid
          raise exception 'Invalid json data' using errcode = 'JSONN';
        end if;
      end loop;
    end if;
  end if;
end;
$$;


--
-- Name: FUNCTION validate_jsonb_no_nulls(input anyelement); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.validate_jsonb_no_nulls(input anyelement) IS 'Validate that provided jsonb does not contain nulls.';


--
-- Name: validate_registration_answers(uuid, uuid[], jsonb); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.validate_registration_answers(event_id uuid, required_question_ids uuid[], answers jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
declare
  v_question app_public.event_questions;
  v_question_id uuid;
  v_answers jsonb;
begin
  -- Check that all required question id's are contained as top level keys in answers
  if not answers ?& required_question_ids::text[] then
    raise exception '' using errcode = 'RQRED';
  end if;

  -- Loop event answers and check that required questions have been answered
  -- It isn't very simple to verify that no nulls are present in jsonb...
  -- We do this with the validate_jsonb_no_nulls function.
  for v_question_id, v_answers in select * from jsonb_each(answers) loop
    select * into v_question from app_public.event_questions where id = v_question_id;

    -- If provided questino id is invalid, raise an error
    if v_question is null then
      raise exception '' using errcode = 'NTFND';
    end if;

    -- If provided answer is for a question
    if v_question.event_id != event_id then
      raise exception '' using errcode = 'EVTID';
    end if;

    -- Validate that the jsonb does not contain nulls
    perform app_public.validate_jsonb_no_nulls(v_answers);

    -- TEXT answers should be of type string
    if v_question.type = 'TEXT' and jsonb_typeof(v_answers) != 'string' then
      raise exception '' using errcode = 'NVLID';
    end if;

    -- RADIO answers should be of type string
    if v_question.type = 'RADIO' and jsonb_typeof(v_answers) != 'string' then
      raise exception '' using errcode = 'NVLID';
    end if;

    -- TEXT answers should be of type string
    if v_question.type = 'CHECKBOX' and jsonb_typeof(v_answers) != 'array' then
      raise exception '' using errcode = 'NVLID';
    end if;

  end loop;
-- If validate_jsonb_no_nulls raises an exception, return a more suitable error message
exception when others then
  if sqlstate = 'RQRED' then
    raise exception 'Required question not answered.' using errcode = 'NVLID';
  elsif sqlstate = 'NTFND' then
    raise exception 'Invalid answer, related question not found.' using errcode = 'NVLID';
  elsif sqlstate = 'EVTID' then
    raise exception 'Invalid answer, question is for another event.' using errcode = 'NVLID';
  elsif sqlstate = 'JSONN' or sqlstate = 'NVLID' then
    raise exception 'Invalid answer data to question of type: %.', v_question.type using errcode = 'NVLID';
  else
    raise exception 'Unknown error. % %', sqlstate, sqlerrm using errcode = 'FFFFF';
  end if;
end;
$$;


--
-- Name: FUNCTION validate_registration_answers(event_id uuid, required_question_ids uuid[], answers jsonb); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.validate_registration_answers(event_id uuid, required_question_ids uuid[], answers jsonb) IS 'Validate registration answers.';


--
-- Name: verify_email(uuid, text); Type: FUNCTION; Schema: app_public; Owner: -
--

CREATE FUNCTION app_public.verify_email(user_email_id uuid, token text) RETURNS boolean
    LANGUAGE plpgsql STRICT SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  update app_public.user_emails
  set
    is_verified = true,
    is_primary = is_primary or not exists(
      select 1 from app_public.user_emails other_email where other_email.user_id = user_emails.user_id and other_email.is_primary is true
    )
  where id = user_email_id
  and exists(
    select 1 from app_private.user_email_secrets where user_email_secrets.user_email_id = user_emails.id and verification_token = token
  );
  return found;
end;
$$;


--
-- Name: FUNCTION verify_email(user_email_id uuid, token text); Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON FUNCTION app_public.verify_email(user_email_id uuid, token text) IS 'Once you have received a verification token for your email, you may call this mutation with that token to make your email verified.';


--
-- Name: registrations_status_and_position; Type: TABLE; Schema: app_hidden; Owner: -
--

CREATE TABLE app_hidden.registrations_status_and_position (
    id uuid NOT NULL,
    event_id uuid,
    quota_id uuid,
    status app_public.registration_status,
    "position" integer
);


--
-- Name: TABLE registrations_status_and_position; Type: COMMENT; Schema: app_hidden; Owner: -
--

COMMENT ON TABLE app_hidden.registrations_status_and_position IS 'Rank and position of registrations, maintained per event by app_private.refresh_registration_positions.';


--
-- Name: feature_flag_events; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.feature_flag_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    old_state app_public.feature_state NOT NULL,
    new_state app_public.feature_state NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE feature_flag_events; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON TABLE app_private.feature_flag_events IS 'One row per feature flag state change.';


--
-- Name: registration_secrets; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.registration_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_token text DEFAULT encode(public.gen_random_bytes(7), 'hex'::text),
    update_token text DEFAULT encode(public.gen_random_bytes(7), 'hex'::text),
    confirmation_email_sent boolean DEFAULT false NOT NULL,
    received_spot_from_queue_email_sent boolean DEFAULT false NOT NULL,
    registration_id uuid NOT NULL,
    event_id uuid NOT NULL,
    quota_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE registration_secrets; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON TABLE app_private.registration_secrets IS 'The contents of this table should never be visible to the user. Contains private data related to event registrations.';


--
-- Name: stripe_early_refunds; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.stripe_early_refunds (
    stripe_payment_intent_id text NOT NULL,
    amount_refunded_cents integer NOT NULL,
    stripe_refund_id text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stripe_early_refunds_amount_refunded_cents_check CHECK ((amount_refunded_cents >= 0))
);


--
-- Name: TABLE stripe_early_refunds; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON TABLE app_private.stripe_early_refunds IS 'Stripe refunds that arrived before their payment was recorded; applied when checkout.session.completed arrives.';


--
-- Name: stripe_events; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.stripe_events (
    id text NOT NULL,
    type text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE stripe_events; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON TABLE app_private.stripe_events IS 'Ids of Stripe webhook events already handled, so that redelivered events are ignored.';


--
-- Name: telegram_link_tokens; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.telegram_link_tokens (
    user_id uuid NOT NULL,
    token_hash bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: telegram_poll_state; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.telegram_poll_state (
    id boolean DEFAULT true NOT NULL,
    next_offset bigint DEFAULT 0 NOT NULL,
    CONSTRAINT telegram_poll_state_id_check CHECK (id)
);


--
-- Name: telegram_preferences; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.telegram_preferences (
    chat_id bigint NOT NULL,
    language text DEFAULT 'auto'::text NOT NULL,
    detected_language text DEFAULT 'en'::text NOT NULL,
    CONSTRAINT telegram_preferences_chat_id_check CHECK ((chat_id > 0)),
    CONSTRAINT telegram_preferences_detected_language_check CHECK ((detected_language = ANY (ARRAY['fi'::text, 'en'::text]))),
    CONSTRAINT telegram_preferences_language_check CHECK ((language = ANY (ARRAY['auto'::text, 'fi'::text, 'en'::text])))
);


--
-- Name: telegram_updates; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.telegram_updates (
    update_id bigint NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: unregistered_email_password_resets; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.unregistered_email_password_resets (
    email public.citext NOT NULL,
    attempts integer DEFAULT 1 NOT NULL,
    latest_attempt timestamp with time zone NOT NULL
);


--
-- Name: TABLE unregistered_email_password_resets; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON TABLE app_private.unregistered_email_password_resets IS 'If someone tries to recover the password for an email that is not registered in our system, this table enables us to rate-limit outgoing emails to avoid spamming.';


--
-- Name: COLUMN unregistered_email_password_resets.attempts; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON COLUMN app_private.unregistered_email_password_resets.attempts IS 'We store the number of attempts to help us detect accounts being attacked.';


--
-- Name: COLUMN unregistered_email_password_resets.latest_attempt; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON COLUMN app_private.unregistered_email_password_resets.latest_attempt IS 'We store the time the last password reset was sent to this email to prevent the email getting flooded.';


--
-- Name: user_authentication_secrets; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.user_authentication_secrets (
    user_authentication_id uuid NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: user_email_secrets; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.user_email_secrets (
    user_email_id uuid NOT NULL,
    verification_token text,
    verification_email_sent_at timestamp with time zone,
    password_reset_email_sent_at timestamp with time zone
);


--
-- Name: TABLE user_email_secrets; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON TABLE app_private.user_email_secrets IS 'The contents of this table should never be visible to the user. Contains data mostly related to email verification and avoiding spamming users.';


--
-- Name: COLUMN user_email_secrets.password_reset_email_sent_at; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON COLUMN app_private.user_email_secrets.password_reset_email_sent_at IS 'We store the time the last password reset was sent to this email to prevent the email getting flooded.';


--
-- Name: user_secrets; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.user_secrets (
    user_id uuid NOT NULL,
    password_hash text,
    last_login_at timestamp with time zone DEFAULT now() NOT NULL,
    failed_password_attempts integer DEFAULT 0 NOT NULL,
    first_failed_password_attempt timestamp with time zone,
    reset_password_token text,
    reset_password_token_generated timestamp with time zone,
    failed_reset_password_attempts integer DEFAULT 0 NOT NULL,
    first_failed_reset_password_attempt timestamp with time zone,
    delete_account_token text,
    delete_account_token_generated timestamp with time zone
);


--
-- Name: TABLE user_secrets; Type: COMMENT; Schema: app_private; Owner: -
--

COMMENT ON TABLE app_private.user_secrets IS 'The contents of this table should never be visible to the user. Contains data mostly related to authentication.';


--
-- Name: event_categories; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.event_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name app_public.translated_field NOT NULL,
    description app_public.translated_field NOT NULL,
    owner_organization_id uuid NOT NULL,
    color app_public.hex_color,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE event_categories; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.event_categories IS 'Table for event categories.';


--
-- Name: COLUMN event_categories.id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_categories.id IS 'Unique identifier for the event category.';


--
-- Name: COLUMN event_categories.name; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_categories.name IS 'Name of the event category.';


--
-- Name: COLUMN event_categories.description; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_categories.description IS 'Short description of the event category.';


--
-- Name: COLUMN event_categories.owner_organization_id; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_categories.owner_organization_id IS 'Identifier of the organizer.';


--
-- Name: COLUMN event_categories.color; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.event_categories.color IS 'Color color the event category.';


--
-- Name: event_registration_reminders; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.event_registration_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    language text DEFAULT 'fi'::text NOT NULL,
    minutes_before integer DEFAULT 30 NOT NULL,
    delivery_method text DEFAULT 'email'::text NOT NULL,
    email_sent_at timestamp with time zone,
    telegram_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT event_registration_reminders_delivery_method_check CHECK ((delivery_method = ANY (ARRAY['email'::text, 'telegram'::text, 'both'::text]))),
    CONSTRAINT event_registration_reminders_language_check CHECK ((language = ANY (ARRAY['fi'::text, 'en'::text]))),
    CONSTRAINT event_registration_reminders_minutes_before_check CHECK (((minutes_before >= 1) AND (minutes_before <= 10080)))
);


--
-- Name: TABLE event_registration_reminders; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.event_registration_reminders IS '@omit create,update
Registration reminders requested by the current user, before registration opens.';


--
-- Name: organization_invitations; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.organization_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code text,
    user_id uuid,
    email public.citext,
    CONSTRAINT organization_invitations_check CHECK (((user_id IS NULL) <> (email IS NULL))),
    CONSTRAINT organization_invitations_check1 CHECK (((code IS NULL) = (email IS NULL)))
);


--
-- Name: organization_memberships; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_owner boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_authentications; Type: TABLE; Schema: app_public; Owner: -
--

CREATE TABLE app_public.user_authentications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    service text NOT NULL,
    identifier text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_authentications; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON TABLE app_public.user_authentications IS 'Contains information about the login providers this user has used, so that they may disconnect them should they wish.';


--
-- Name: COLUMN user_authentications.service; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.user_authentications.service IS 'The login service used, e.g. `twitter` or `github`.';


--
-- Name: COLUMN user_authentications.identifier; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.user_authentications.identifier IS 'A unique identifier for the user within the login service.';


--
-- Name: COLUMN user_authentications.details; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON COLUMN app_public.user_authentications.details IS 'Additional profile details extracted from this login method';


--
-- Name: registrations_status_and_position registrations_status_and_position_pkey; Type: CONSTRAINT; Schema: app_hidden; Owner: -
--

ALTER TABLE ONLY app_hidden.registrations_status_and_position
    ADD CONSTRAINT registrations_status_and_position_pkey PRIMARY KEY (id);


--
-- Name: feature_flag_events feature_flag_events_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.feature_flag_events
    ADD CONSTRAINT feature_flag_events_pkey PRIMARY KEY (id);


--
-- Name: registration_secrets registration_secrets_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.registration_secrets
    ADD CONSTRAINT registration_secrets_pkey PRIMARY KEY (id);


--
-- Name: registration_secrets registration_secrets_registration_token_key; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.registration_secrets
    ADD CONSTRAINT registration_secrets_registration_token_key UNIQUE (registration_token);


--
-- Name: registration_secrets registration_secrets_update_token_key; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.registration_secrets
    ADD CONSTRAINT registration_secrets_update_token_key UNIQUE (update_token);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (uuid);


--
-- Name: stripe_early_refunds stripe_early_refunds_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.stripe_early_refunds
    ADD CONSTRAINT stripe_early_refunds_pkey PRIMARY KEY (stripe_payment_intent_id);


--
-- Name: stripe_events stripe_events_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.stripe_events
    ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);


--
-- Name: telegram_link_tokens telegram_link_tokens_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_pkey PRIMARY KEY (user_id);


--
-- Name: telegram_link_tokens telegram_link_tokens_token_hash_key; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: telegram_poll_state telegram_poll_state_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.telegram_poll_state
    ADD CONSTRAINT telegram_poll_state_pkey PRIMARY KEY (id);


--
-- Name: telegram_preferences telegram_preferences_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.telegram_preferences
    ADD CONSTRAINT telegram_preferences_pkey PRIMARY KEY (chat_id);


--
-- Name: telegram_updates telegram_updates_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.telegram_updates
    ADD CONSTRAINT telegram_updates_pkey PRIMARY KEY (update_id);


--
-- Name: unregistered_email_password_resets unregistered_email_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.unregistered_email_password_resets
    ADD CONSTRAINT unregistered_email_pkey PRIMARY KEY (email);


--
-- Name: user_authentication_secrets user_authentication_secrets_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.user_authentication_secrets
    ADD CONSTRAINT user_authentication_secrets_pkey PRIMARY KEY (user_authentication_id);


--
-- Name: user_email_secrets user_email_secrets_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.user_email_secrets
    ADD CONSTRAINT user_email_secrets_pkey PRIMARY KEY (user_email_id);


--
-- Name: user_secrets user_secrets_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.user_secrets
    ADD CONSTRAINT user_secrets_pkey PRIMARY KEY (user_id);


--
-- Name: user_emails _cnstr_user_emails_user_id_email_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.user_emails
    ADD CONSTRAINT _cnstr_user_emails_user_id_email_key UNIQUE (user_id, email);


--
-- Name: event_categories event_categories_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);


--
-- Name: event_questions event_questions_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_questions
    ADD CONSTRAINT event_questions_pkey PRIMARY KEY (id);


--
-- Name: event_registration_reminders event_registration_reminders_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_registration_reminders
    ADD CONSTRAINT event_registration_reminders_pkey PRIMARY KEY (id);


--
-- Name: event_registration_reminders event_registration_reminders_user_id_event_id_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_registration_reminders
    ADD CONSTRAINT event_registration_reminders_user_id_event_id_key UNIQUE (user_id, event_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: events events_slug_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.events
    ADD CONSTRAINT events_slug_key UNIQUE (slug);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);


--
-- Name: organization_invitations organization_invitations_organization_id_email_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_invitations
    ADD CONSTRAINT organization_invitations_organization_id_email_key UNIQUE (organization_id, email);


--
-- Name: organization_invitations organization_invitations_organization_id_user_id_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_invitations
    ADD CONSTRAINT organization_invitations_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_invitations organization_invitations_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_invitations
    ADD CONSTRAINT organization_invitations_pkey PRIMARY KEY (id);


--
-- Name: organization_memberships organization_memberships_organization_id_user_id_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_stripe_checkout_session_id_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.payments
    ADD CONSTRAINT payments_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id);


--
-- Name: quotas quotas_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.quotas
    ADD CONSTRAINT quotas_pkey PRIMARY KEY (id);


--
-- Name: registration_profiles registration_profiles_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.registration_profiles
    ADD CONSTRAINT registration_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: registrations registrations_email_event_id_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.registrations
    ADD CONSTRAINT registrations_email_event_id_key UNIQUE (email, event_id);


--
-- Name: registrations registrations_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.registrations
    ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);


--
-- Name: reminder_preferences reminder_preferences_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.reminder_preferences
    ADD CONSTRAINT reminder_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: telegram_accounts telegram_accounts_chat_id_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_chat_id_key UNIQUE (chat_id);


--
-- Name: telegram_accounts telegram_accounts_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: user_authentications uniq_user_authentications; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.user_authentications
    ADD CONSTRAINT uniq_user_authentications UNIQUE (service, identifier);


--
-- Name: user_authentications user_authentications_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.user_authentications
    ADD CONSTRAINT user_authentications_pkey PRIMARY KEY (id);


--
-- Name: user_emails user_emails_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.user_emails
    ADD CONSTRAINT user_emails_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: registrations_status_and_position_event_id_idx; Type: INDEX; Schema: app_hidden; Owner: -
--

CREATE INDEX registrations_status_and_position_event_id_idx ON app_hidden.registrations_status_and_position USING btree (event_id);


--
-- Name: registrations_status_and_position_quota_id_idx; Type: INDEX; Schema: app_hidden; Owner: -
--

CREATE INDEX registrations_status_and_position_quota_id_idx ON app_hidden.registrations_status_and_position USING btree (quota_id);


--
-- Name: feature_flag_events_actor_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX feature_flag_events_actor_idx ON app_private.feature_flag_events USING btree (actor);


--
-- Name: feature_flag_events_key_created_at_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX feature_flag_events_key_created_at_idx ON app_private.feature_flag_events USING btree (key, created_at);


--
-- Name: registration_secrets_event_id_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX registration_secrets_event_id_idx ON app_private.registration_secrets USING btree (event_id);


--
-- Name: registration_secrets_quota_id_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX registration_secrets_quota_id_idx ON app_private.registration_secrets USING btree (quota_id);


--
-- Name: registration_secrets_registration_id_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX registration_secrets_registration_id_idx ON app_private.registration_secrets USING btree (registration_id);


--
-- Name: sessions_mcp_oauth_sid_key; Type: INDEX; Schema: app_private; Owner: -
--

CREATE UNIQUE INDEX sessions_mcp_oauth_sid_key ON app_private.sessions USING btree (oauth_sid) WHERE (kind = 'mcp'::text);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX sessions_user_id_idx ON app_private.sessions USING btree (user_id);


--
-- Name: event_categories_created_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_categories_created_by_idx ON app_public.event_categories USING btree (created_by);


--
-- Name: event_categories_name_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_categories_name_idx ON app_public.event_categories USING btree (name);


--
-- Name: event_categories_owner_organization_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_categories_owner_organization_id_idx ON app_public.event_categories USING btree (owner_organization_id);


--
-- Name: event_categories_updated_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_categories_updated_by_idx ON app_public.event_categories USING btree (updated_by);


--
-- Name: event_questions_created_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_questions_created_by_idx ON app_public.event_questions USING btree (created_by);


--
-- Name: event_questions_event_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_questions_event_id_idx ON app_public.event_questions USING btree (event_id);


--
-- Name: event_questions_position_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_questions_position_idx ON app_public.event_questions USING btree ("position");


--
-- Name: event_questions_updated_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_questions_updated_by_idx ON app_public.event_questions USING btree (updated_by);


--
-- Name: event_registration_reminders_event_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX event_registration_reminders_event_id_idx ON app_public.event_registration_reminders USING btree (event_id);


--
-- Name: events_category_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_category_id_idx ON app_public.events USING btree (category_id);


--
-- Name: events_created_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_created_by_idx ON app_public.events USING btree (created_by);


--
-- Name: events_event_end_time_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_event_end_time_idx ON app_public.events USING btree (event_end_time);


--
-- Name: events_event_start_time_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_event_start_time_idx ON app_public.events USING btree (event_start_time);


--
-- Name: events_is_draft_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_is_draft_idx ON app_public.events USING btree (is_draft);


--
-- Name: events_is_highlighted_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_is_highlighted_idx ON app_public.events USING btree (is_highlighted);


--
-- Name: events_name_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_name_idx ON app_public.events USING btree (name);


--
-- Name: events_owner_organization_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_owner_organization_id_idx ON app_public.events USING btree (owner_organization_id);


--
-- Name: events_registration_end_time_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_registration_end_time_idx ON app_public.events USING btree (registration_end_time);


--
-- Name: events_registration_start_time_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_registration_start_time_idx ON app_public.events USING btree (registration_start_time);


--
-- Name: events_updated_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX events_updated_by_idx ON app_public.events USING btree (updated_by);


--
-- Name: feature_flags_updated_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX feature_flags_updated_by_idx ON app_public.feature_flags USING btree (updated_by);


--
-- Name: idx_user_emails_primary; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX idx_user_emails_primary ON app_public.user_emails USING btree (is_primary, user_id);


--
-- Name: idx_user_emails_user; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX idx_user_emails_user ON app_public.user_emails USING btree (user_id);


--
-- Name: organization_invitations_user_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX organization_invitations_user_id_idx ON app_public.organization_invitations USING btree (user_id);


--
-- Name: organization_memberships_user_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX organization_memberships_user_id_idx ON app_public.organization_memberships USING btree (user_id);


--
-- Name: organizations_created_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX organizations_created_by_idx ON app_public.organizations USING btree (created_by);


--
-- Name: organizations_updated_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX organizations_updated_by_idx ON app_public.organizations USING btree (updated_by);


--
-- Name: payments_created_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX payments_created_by_idx ON app_public.payments USING btree (created_by);


--
-- Name: payments_event_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX payments_event_id_idx ON app_public.payments USING btree (event_id);


--
-- Name: payments_one_paid_per_registration_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE UNIQUE INDEX payments_one_paid_per_registration_idx ON app_public.payments USING btree (registration_id) WHERE ((status = 'PAID'::app_public.payment_status) AND (registration_id IS NOT NULL));


--
-- Name: payments_quota_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX payments_quota_id_idx ON app_public.payments USING btree (quota_id);


--
-- Name: payments_registration_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX payments_registration_id_idx ON app_public.payments USING btree (registration_id);


--
-- Name: payments_stripe_payment_intent_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX payments_stripe_payment_intent_id_idx ON app_public.payments USING btree (stripe_payment_intent_id);


--
-- Name: quotas_created_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX quotas_created_by_idx ON app_public.quotas USING btree (created_by);


--
-- Name: quotas_event_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX quotas_event_id_idx ON app_public.quotas USING btree (event_id);


--
-- Name: quotas_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX quotas_id_idx ON app_public.quotas USING btree (id);


--
-- Name: quotas_position_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX quotas_position_idx ON app_public.quotas USING btree ("position");


--
-- Name: quotas_updated_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX quotas_updated_by_idx ON app_public.quotas USING btree (updated_by);


--
-- Name: registrations_created_at_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX registrations_created_at_idx ON app_public.registrations USING btree (created_at);


--
-- Name: registrations_created_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX registrations_created_by_idx ON app_public.registrations USING btree (created_by);


--
-- Name: registrations_event_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX registrations_event_id_idx ON app_public.registrations USING btree (event_id);


--
-- Name: registrations_quota_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX registrations_quota_id_idx ON app_public.registrations USING btree (quota_id);


--
-- Name: registrations_updated_by_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX registrations_updated_by_idx ON app_public.registrations USING btree (updated_by);


--
-- Name: uniq_user_emails_primary_email; Type: INDEX; Schema: app_public; Owner: -
--

CREATE UNIQUE INDEX uniq_user_emails_primary_email ON app_public.user_emails USING btree (user_id) WHERE (is_primary IS TRUE);


--
-- Name: uniq_user_emails_verified_email; Type: INDEX; Schema: app_public; Owner: -
--

CREATE UNIQUE INDEX uniq_user_emails_verified_email ON app_public.user_emails USING btree (email) WHERE (is_verified IS TRUE);


--
-- Name: user_authentications_user_id_idx; Type: INDEX; Schema: app_public; Owner: -
--

CREATE INDEX user_authentications_user_id_idx ON app_public.user_authentications USING btree (user_id);


--
-- Name: registration_secrets _100_timestamps; Type: TRIGGER; Schema: app_private; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_private.registration_secrets FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: event_categories _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.event_categories FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: event_questions _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.event_questions FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: events _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.events FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: organizations _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.organizations FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: payments _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.payments FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: quotas _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.quotas FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: registration_profiles _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.registration_profiles FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: registrations _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.registrations FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: user_authentications _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.user_authentications FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: user_emails _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.user_emails FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: users _100_timestamps; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _100_timestamps BEFORE INSERT OR UPDATE ON app_public.users FOR EACH ROW EXECUTE FUNCTION app_private.tg__timestamps();


--
-- Name: user_emails _200_forbid_existing_email; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _200_forbid_existing_email BEFORE INSERT ON app_public.user_emails FOR EACH ROW EXECUTE FUNCTION app_public.tg_user_emails__forbid_if_verified();


--
-- Name: event_categories _200_ownership_info; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _200_ownership_info BEFORE INSERT OR UPDATE ON app_public.event_categories FOR EACH ROW EXECUTE FUNCTION app_private.tg__ownership_info();


--
-- Name: event_questions _200_ownership_info; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _200_ownership_info BEFORE INSERT OR UPDATE ON app_public.event_questions FOR EACH ROW EXECUTE FUNCTION app_private.tg__ownership_info();


--
-- Name: events _200_ownership_info; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _200_ownership_info BEFORE INSERT OR UPDATE ON app_public.events FOR EACH ROW EXECUTE FUNCTION app_private.tg__ownership_info();


--
-- Name: organizations _200_ownership_info; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _200_ownership_info BEFORE INSERT OR UPDATE ON app_public.organizations FOR EACH ROW EXECUTE FUNCTION app_private.tg__ownership_info();


--
-- Name: quotas _200_ownership_info; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _200_ownership_info BEFORE INSERT OR UPDATE ON app_public.quotas FOR EACH ROW EXECUTE FUNCTION app_private.tg__ownership_info();


--
-- Name: registrations _200_ownership_info; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _200_ownership_info BEFORE INSERT OR UPDATE ON app_public.registrations FOR EACH ROW EXECUTE FUNCTION app_private.tg__ownership_info();


--
-- Name: registrations _200_queue_payment_refund; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _200_queue_payment_refund BEFORE DELETE ON app_public.registrations FOR EACH ROW EXECUTE FUNCTION app_private.tg_registrations__queue_payment_refund();


--
-- Name: registrations _250_snapshot_price; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _250_snapshot_price BEFORE INSERT OR UPDATE ON app_public.registrations FOR EACH ROW EXECUTE FUNCTION app_private.tg_registrations__snapshot_price();


--
-- Name: events _300_refresh_registration_positions; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _300_refresh_registration_positions AFTER INSERT OR DELETE ON app_public.events FOR EACH ROW EXECUTE FUNCTION app_private.tg__refresh_registration_positions();


--
-- Name: quotas _300_refresh_registration_positions; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _300_refresh_registration_positions AFTER INSERT OR DELETE ON app_public.quotas FOR EACH ROW EXECUTE FUNCTION app_private.tg__refresh_registration_positions();


--
-- Name: registrations _300_registration_is_valid; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _300_registration_is_valid BEFORE INSERT ON app_public.registrations FOR EACH ROW EXECUTE FUNCTION app_private.tg__registration_is_valid();


--
-- Name: events _301_refresh_registration_positions; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _301_refresh_registration_positions AFTER UPDATE ON app_public.events FOR EACH ROW WHEN ((old.open_quota_size IS DISTINCT FROM new.open_quota_size)) EXECUTE FUNCTION app_private.tg__refresh_registration_positions();


--
-- Name: quotas _301_refresh_registration_positions; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _301_refresh_registration_positions AFTER UPDATE ON app_public.quotas FOR EACH ROW WHEN (((old.size IS DISTINCT FROM new.size) OR (old.event_id IS DISTINCT FROM new.event_id))) EXECUTE FUNCTION app_private.tg__refresh_registration_positions();


--
-- Name: registrations _400_gql_registration_updated; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _400_gql_registration_updated AFTER INSERT OR DELETE OR UPDATE ON app_public.registrations FOR EACH ROW EXECUTE FUNCTION app_public.tg__graphql_subscription('registrationUpdated', 'graphql:eventRegistrations:$1', 'event_id');


--
-- Name: user_emails _500_audit_added; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_audit_added AFTER INSERT ON app_public.user_emails FOR EACH ROW EXECUTE FUNCTION app_private.tg__add_audit_job('added_email', 'user_id', 'id', 'email');


--
-- Name: user_authentications _500_audit_removed; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_audit_removed AFTER DELETE ON app_public.user_authentications FOR EACH ROW EXECUTE FUNCTION app_private.tg__add_audit_job('unlinked_account', 'user_id', 'service', 'identifier');


--
-- Name: user_emails _500_audit_removed; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_audit_removed AFTER DELETE ON app_public.user_emails FOR EACH ROW EXECUTE FUNCTION app_private.tg__add_audit_job('removed_email', 'user_id', 'id', 'email');


--
-- Name: users _500_deletion_organization_checks_and_actions; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_deletion_organization_checks_and_actions BEFORE DELETE ON app_public.users FOR EACH ROW WHEN ((app_public.current_user_id() IS NOT NULL)) EXECUTE FUNCTION app_public.tg_users__deletion_organization_checks_and_actions();


--
-- Name: users _500_gql_update; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_gql_update AFTER UPDATE ON app_public.users FOR EACH ROW EXECUTE FUNCTION app_public.tg__graphql_subscription('userChanged', 'graphql:user:$1', 'id');


--
-- Name: user_emails _500_insert_secrets; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_insert_secrets AFTER INSERT ON app_public.user_emails FOR EACH ROW EXECUTE FUNCTION app_private.tg_user_email_secrets__insert_with_user_email();


--
-- Name: users _500_insert_secrets; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_insert_secrets AFTER INSERT ON app_public.users FOR EACH ROW EXECUTE FUNCTION app_private.tg_user_secrets__insert_with_user();


--
-- Name: user_emails _500_prevent_delete_last; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_prevent_delete_last AFTER DELETE ON app_public.user_emails REFERENCING OLD TABLE AS deleted FOR EACH STATEMENT EXECUTE FUNCTION app_public.tg_user_emails__prevent_delete_last_email();


--
-- Name: organization_invitations _500_send_email; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_send_email AFTER INSERT ON app_public.organization_invitations FOR EACH ROW EXECUTE FUNCTION app_private.tg__add_job('organization_invitations__send_invite');


--
-- Name: registrations _500_send_registration_email; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_send_registration_email AFTER UPDATE ON app_public.registrations FOR EACH ROW EXECUTE FUNCTION app_private.tg__add_job('registration__send_confirmation_email');


--
-- Name: user_emails _500_verify_account_on_verified; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _500_verify_account_on_verified AFTER INSERT OR UPDATE OF is_verified ON app_public.user_emails FOR EACH ROW WHEN ((new.is_verified IS TRUE)) EXECUTE FUNCTION app_public.tg_user_emails__verify_account_on_verified();


--
-- Name: registrations _700_refresh_registration_positions; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _700_refresh_registration_positions AFTER INSERT OR DELETE ON app_public.registrations FOR EACH ROW EXECUTE FUNCTION app_private.tg__refresh_registration_positions();


--
-- Name: registrations _701_refresh_registration_positions; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _701_refresh_registration_positions AFTER UPDATE ON app_public.registrations FOR EACH ROW WHEN (((old.created_at IS DISTINCT FROM new.created_at) OR (old.quota_id IS DISTINCT FROM new.quota_id) OR (old.event_id IS DISTINCT FROM new.event_id))) EXECUTE FUNCTION app_private.tg__refresh_registration_positions();


--
-- Name: user_emails _900_send_verification_email; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER _900_send_verification_email AFTER INSERT ON app_public.user_emails FOR EACH ROW WHEN ((new.is_verified IS FALSE)) EXECUTE FUNCTION app_private.tg__add_job('user_emails__send_verification');


--
-- Name: events reschedule_registration_reminders; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER reschedule_registration_reminders AFTER UPDATE OF registration_start_time, is_draft ON app_public.events FOR EACH ROW EXECUTE FUNCTION app_private.tg__reschedule_registration_reminders();


--
-- Name: event_registration_reminders schedule_registration_reminder; Type: TRIGGER; Schema: app_public; Owner: -
--

CREATE TRIGGER schedule_registration_reminder AFTER INSERT OR DELETE OR UPDATE OF minutes_before, delivery_method ON app_public.event_registration_reminders FOR EACH ROW EXECUTE FUNCTION app_private.tg__schedule_registration_reminder();


--
-- Name: feature_flag_events feature_flag_events_actor_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.feature_flag_events
    ADD CONSTRAINT feature_flag_events_actor_fkey FOREIGN KEY (actor) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: registration_secrets registration_secrets_event_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.registration_secrets
    ADD CONSTRAINT registration_secrets_event_id_fkey FOREIGN KEY (event_id) REFERENCES app_public.events(id) ON DELETE CASCADE;


--
-- Name: registration_secrets registration_secrets_quota_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.registration_secrets
    ADD CONSTRAINT registration_secrets_quota_id_fkey FOREIGN KEY (quota_id) REFERENCES app_public.quotas(id);


--
-- Name: registration_secrets registration_secrets_registration_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.registration_secrets
    ADD CONSTRAINT registration_secrets_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES app_public.registrations(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: telegram_link_tokens telegram_link_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: user_authentication_secrets user_authentication_secrets_user_authentication_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.user_authentication_secrets
    ADD CONSTRAINT user_authentication_secrets_user_authentication_id_fkey FOREIGN KEY (user_authentication_id) REFERENCES app_public.user_authentications(id) ON DELETE CASCADE;


--
-- Name: user_email_secrets user_email_secrets_user_email_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.user_email_secrets
    ADD CONSTRAINT user_email_secrets_user_email_id_fkey FOREIGN KEY (user_email_id) REFERENCES app_public.user_emails(id) ON DELETE CASCADE;


--
-- Name: user_secrets user_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.user_secrets
    ADD CONSTRAINT user_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: event_categories event_categories_created_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_categories
    ADD CONSTRAINT event_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: event_categories event_categories_owner_organization_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_categories
    ADD CONSTRAINT event_categories_owner_organization_id_fkey FOREIGN KEY (owner_organization_id) REFERENCES app_public.organizations(id) ON DELETE CASCADE;


--
-- Name: event_categories event_categories_updated_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_categories
    ADD CONSTRAINT event_categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: event_questions event_questions_created_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_questions
    ADD CONSTRAINT event_questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: event_questions event_questions_event_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_questions
    ADD CONSTRAINT event_questions_event_id_fkey FOREIGN KEY (event_id) REFERENCES app_public.events(id) ON DELETE CASCADE;


--
-- Name: event_questions event_questions_updated_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_questions
    ADD CONSTRAINT event_questions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: event_registration_reminders event_registration_reminders_event_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_registration_reminders
    ADD CONSTRAINT event_registration_reminders_event_id_fkey FOREIGN KEY (event_id) REFERENCES app_public.events(id) ON DELETE CASCADE;


--
-- Name: event_registration_reminders event_registration_reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.event_registration_reminders
    ADD CONSTRAINT event_registration_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: events events_category_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.events
    ADD CONSTRAINT events_category_id_fkey FOREIGN KEY (category_id) REFERENCES app_public.event_categories(id) ON DELETE SET NULL;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: events events_owner_organization_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.events
    ADD CONSTRAINT events_owner_organization_id_fkey FOREIGN KEY (owner_organization_id) REFERENCES app_public.organizations(id) ON DELETE CASCADE;


--
-- Name: events events_updated_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.events
    ADD CONSTRAINT events_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: feature_flags feature_flags_updated_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.feature_flags
    ADD CONSTRAINT feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: CONSTRAINT feature_flags_updated_by_fkey ON feature_flags; Type: COMMENT; Schema: app_public; Owner: -
--

COMMENT ON CONSTRAINT feature_flags_updated_by_fkey ON app_public.feature_flags IS '@omit many';


--
-- Name: organization_invitations organization_invitations_organization_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_invitations
    ADD CONSTRAINT organization_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES app_public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_invitations organization_invitations_user_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_invitations
    ADD CONSTRAINT organization_invitations_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES app_public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organization_memberships
    ADD CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_created_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organizations
    ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_updated_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.organizations
    ADD CONSTRAINT organizations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_event_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.payments
    ADD CONSTRAINT payments_event_id_fkey FOREIGN KEY (event_id) REFERENCES app_public.events(id) ON DELETE SET NULL;


--
-- Name: payments payments_quota_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.payments
    ADD CONSTRAINT payments_quota_id_fkey FOREIGN KEY (quota_id) REFERENCES app_public.quotas(id) ON DELETE SET NULL;


--
-- Name: payments payments_registration_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.payments
    ADD CONSTRAINT payments_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES app_public.registrations(id) ON DELETE SET NULL;


--
-- Name: quotas quotas_created_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.quotas
    ADD CONSTRAINT quotas_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: quotas quotas_event_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.quotas
    ADD CONSTRAINT quotas_event_id_fkey FOREIGN KEY (event_id) REFERENCES app_public.events(id) ON DELETE CASCADE;


--
-- Name: quotas quotas_updated_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.quotas
    ADD CONSTRAINT quotas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: registration_profiles registration_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.registration_profiles
    ADD CONSTRAINT registration_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: registrations registrations_created_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.registrations
    ADD CONSTRAINT registrations_created_by_fkey FOREIGN KEY (created_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: registrations registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.registrations
    ADD CONSTRAINT registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES app_public.events(id) ON DELETE CASCADE;


--
-- Name: registrations registrations_quota_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.registrations
    ADD CONSTRAINT registrations_quota_id_fkey FOREIGN KEY (quota_id) REFERENCES app_public.quotas(id);


--
-- Name: registrations registrations_updated_by_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.registrations
    ADD CONSTRAINT registrations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app_public.users(id) ON DELETE SET NULL;


--
-- Name: reminder_preferences reminder_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.reminder_preferences
    ADD CONSTRAINT reminder_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: telegram_accounts telegram_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: user_authentications user_authentications_user_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.user_authentications
    ADD CONSTRAINT user_authentications_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: user_emails user_emails_user_id_fkey; Type: FK CONSTRAINT; Schema: app_public; Owner: -
--

ALTER TABLE ONLY app_public.user_emails
    ADD CONSTRAINT user_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_public.users(id) ON DELETE CASCADE;


--
-- Name: registrations_status_and_position; Type: ROW SECURITY; Schema: app_hidden; Owner: -
--

ALTER TABLE app_hidden.registrations_status_and_position ENABLE ROW LEVEL SECURITY;

--
-- Name: registrations_status_and_position select_all; Type: POLICY; Schema: app_hidden; Owner: -
--

CREATE POLICY select_all ON app_hidden.registrations_status_and_position FOR SELECT USING (true);


--
-- Name: feature_flag_events; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.feature_flag_events ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_secrets; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.registration_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_early_refunds; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.stripe_early_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_events; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.stripe_events ENABLE ROW LEVEL SECURITY;

--
-- Name: user_authentication_secrets; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.user_authentication_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: user_email_secrets; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.user_email_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: user_secrets; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.user_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_profiles delete_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY delete_own ON app_public.registration_profiles FOR DELETE USING ((user_id = app_public.current_user_id()));


--
-- Name: user_authentications delete_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY delete_own ON app_public.user_authentications FOR DELETE USING ((user_id = app_public.current_user_id()));


--
-- Name: user_emails delete_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY delete_own ON app_public.user_emails FOR DELETE USING ((user_id = app_public.current_user_id()));


--
-- Name: event_categories; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.event_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: event_questions; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.event_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: event_registration_reminders; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.event_registration_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_flags; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.feature_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_profiles insert_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY insert_own ON app_public.registration_profiles FOR INSERT WITH CHECK ((user_id = app_public.current_user_id()));


--
-- Name: user_emails insert_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY insert_own ON app_public.user_emails FOR INSERT WITH CHECK ((user_id = app_public.current_user_id()));


--
-- Name: event_categories manage_admin; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_admin ON app_public.event_categories USING (app_public.current_user_is_admin());


--
-- Name: event_questions manage_admin; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_admin ON app_public.event_questions USING (app_public.current_user_is_admin());


--
-- Name: events manage_admin; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_admin ON app_public.events USING (app_public.current_user_is_admin());


--
-- Name: organizations manage_admin; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_admin ON app_public.organizations USING (app_public.current_user_is_admin());


--
-- Name: quotas manage_admin; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_admin ON app_public.quotas USING (app_public.current_user_is_admin());


--
-- Name: registrations manage_admin; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_admin ON app_public.registrations USING (app_public.current_user_is_admin());


--
-- Name: event_questions manage_event; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_event ON app_public.event_questions USING (app_public.current_user_has_event_permissions(event_id));


--
-- Name: quotas manage_event; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_event ON app_public.quotas USING (app_public.current_user_has_event_permissions(event_id));


--
-- Name: event_categories manage_organization; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_organization ON app_public.event_categories USING (app_public.current_user_is_owner_organization_member(owner_organization_id));


--
-- Name: events manage_organization; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY manage_organization ON app_public.events USING (app_public.current_user_is_owner_organization_member(owner_organization_id));


--
-- Name: organization_invitations; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.organization_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_memberships; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.organization_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_preferences own_reminder_preferences; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY own_reminder_preferences ON app_public.reminder_preferences USING ((user_id = app_public.current_user_id()));


--
-- Name: event_registration_reminders own_reminders; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY own_reminders ON app_public.event_registration_reminders USING ((user_id = app_public.current_user_id()));


--
-- Name: telegram_accounts own_telegram_account; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY own_telegram_account ON app_public.telegram_accounts USING ((user_id = app_public.current_user_id()));


--
-- Name: payments; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: quotas; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.quotas ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_profiles; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.registration_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: registrations; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_preferences; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.reminder_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: event_categories select_all; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_all ON app_public.event_categories FOR SELECT USING (true);


--
-- Name: event_questions select_all; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_all ON app_public.event_questions FOR SELECT USING (true);


--
-- Name: events select_all; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_all ON app_public.events FOR SELECT USING ((is_draft IS FALSE));


--
-- Name: organizations select_all; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_all ON app_public.organizations FOR SELECT USING (true);


--
-- Name: quotas select_all; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_all ON app_public.quotas FOR SELECT USING (true);


--
-- Name: registrations select_all; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_all ON app_public.registrations FOR SELECT USING (true);


--
-- Name: users select_all; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_all ON app_public.users FOR SELECT USING (true);


--
-- Name: feature_flags select_developer; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_developer ON app_public.feature_flags FOR SELECT USING (app_public.current_user_is_developer());


--
-- Name: payments select_event_permissions; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_event_permissions ON app_public.payments FOR SELECT USING ((app_public.current_user_is_admin() OR app_public.current_user_has_event_permissions(event_id)));


--
-- Name: organization_memberships select_invited; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_invited ON app_public.organization_memberships FOR SELECT USING ((organization_id IN ( SELECT app_public.current_user_invited_organization_ids() AS current_user_invited_organization_ids)));


--
-- Name: organization_memberships select_member; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_member ON app_public.organization_memberships FOR SELECT USING ((organization_id IN ( SELECT app_public.current_user_member_organization_ids() AS current_user_member_organization_ids)));


--
-- Name: registration_profiles select_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_own ON app_public.registration_profiles FOR SELECT USING ((user_id = app_public.current_user_id()));


--
-- Name: user_authentications select_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_own ON app_public.user_authentications FOR SELECT USING ((user_id = app_public.current_user_id()));


--
-- Name: user_emails select_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY select_own ON app_public.user_emails FOR SELECT USING ((user_id = app_public.current_user_id()));


--
-- Name: telegram_accounts; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.telegram_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: registrations update_all; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY update_all ON app_public.registrations FOR UPDATE USING (true);


--
-- Name: registration_profiles update_own; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY update_own ON app_public.registration_profiles FOR UPDATE USING ((user_id = app_public.current_user_id()));


--
-- Name: organizations update_owner; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY update_owner ON app_public.organizations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM app_public.organization_memberships
  WHERE ((organization_memberships.organization_id = organizations.id) AND (organization_memberships.user_id = app_public.current_user_id()) AND (organization_memberships.is_owner IS TRUE)))));


--
-- Name: users update_self; Type: POLICY; Schema: app_public; Owner: -
--

CREATE POLICY update_self ON app_public.users FOR UPDATE USING ((id = app_public.current_user_id()));


--
-- Name: user_authentications; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.user_authentications ENABLE ROW LEVEL SECURITY;

--
-- Name: user_emails; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.user_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: app_public; Owner: -
--

ALTER TABLE app_public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA app_hidden; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA app_hidden TO ilmo_visitor;


--
-- Name: SCHEMA app_public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA app_public TO ilmo_visitor;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ilmo_visitor;


--
-- Name: FUNCTION check_language(_column jsonb); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.check_language(_column jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.check_language(_column jsonb) TO ilmo_visitor;


--
-- Name: FUNCTION backfill_registration_prices(event_id uuid); Type: ACL; Schema: app_hidden; Owner: -
--

REVOKE ALL ON FUNCTION app_hidden.backfill_registration_prices(event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_hidden.backfill_registration_prices(event_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION assert_valid_password(new_password text); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.assert_valid_password(new_password text) FROM PUBLIC;


--
-- Name: FUNCTION connect_telegram(token text, chat_id bigint, username text); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.connect_telegram(token text, chat_id bigint, username text) FROM PUBLIC;


--
-- Name: FUNCTION current_user_can_manage_event_payments(event_id uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.current_user_can_manage_event_payments(event_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION delete_registration_without_refund(registration_id uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.delete_registration_without_refund(registration_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION disconnect_telegram(target_user uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.disconnect_telegram(target_user uuid) FROM PUBLIC;


--
-- Name: TABLE users; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT ON TABLE app_public.users TO ilmo_visitor;


--
-- Name: COLUMN users.username; Type: ACL; Schema: app_public; Owner: -
--

GRANT UPDATE(username) ON TABLE app_public.users TO ilmo_visitor;


--
-- Name: COLUMN users.name; Type: ACL; Schema: app_public; Owner: -
--

GRANT UPDATE(name) ON TABLE app_public.users TO ilmo_visitor;


--
-- Name: COLUMN users.avatar_url; Type: ACL; Schema: app_public; Owner: -
--

GRANT UPDATE(avatar_url) ON TABLE app_public.users TO ilmo_visitor;


--
-- Name: FUNCTION link_or_register_user(f_user_id uuid, f_service character varying, f_identifier character varying, f_profile json, f_auth_details json); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.link_or_register_user(f_user_id uuid, f_service character varying, f_identifier character varying, f_profile json, f_auth_details json) FROM PUBLIC;


--
-- Name: FUNCTION login(username public.citext, password text); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.login(username public.citext, password text) FROM PUBLIC;


--
-- Name: FUNCTION really_create_user(username public.citext, email text, name text, avatar_url text, password text, email_is_verified boolean, is_admin boolean); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.really_create_user(username public.citext, email text, name text, avatar_url text, password text, email_is_verified boolean, is_admin boolean) FROM PUBLIC;


--
-- Name: FUNCTION refresh_registration_positions(p_event_id uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.refresh_registration_positions(p_event_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION register_user(f_service character varying, f_identifier character varying, f_profile json, f_auth_details json, f_email_is_verified boolean); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.register_user(f_service character varying, f_identifier character varying, f_profile json, f_auth_details json, f_email_is_verified boolean) FROM PUBLIC;


--
-- Name: TABLE registrations; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.registrations TO ilmo_visitor;


--
-- Name: COLUMN registrations.event_id; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(event_id) ON TABLE app_public.registrations TO ilmo_visitor;


--
-- Name: COLUMN registrations.quota_id; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(quota_id) ON TABLE app_public.registrations TO ilmo_visitor;


--
-- Name: COLUMN registrations.first_name; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(first_name),UPDATE(first_name) ON TABLE app_public.registrations TO ilmo_visitor;


--
-- Name: COLUMN registrations.last_name; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(last_name),UPDATE(last_name) ON TABLE app_public.registrations TO ilmo_visitor;


--
-- Name: COLUMN registrations.email; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(email) ON TABLE app_public.registrations TO ilmo_visitor;


--
-- Name: COLUMN registrations.answers; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(answers),UPDATE(answers) ON TABLE app_public.registrations TO ilmo_visitor;


--
-- Name: COLUMN registrations.is_finished; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(is_finished) ON TABLE app_public.registrations TO ilmo_visitor;


--
-- Name: FUNCTION registration_payment_status(registration app_public.registrations); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.registration_payment_status(registration app_public.registrations) FROM PUBLIC;


--
-- Name: FUNCTION reset_password(user_id uuid, reset_token text, new_password text); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.reset_password(user_id uuid, reset_token text, new_password text) FROM PUBLIC;


--
-- Name: FUNCTION schedule_registration_reminder(reminder_id uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.schedule_registration_reminder(reminder_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION set_feature_available(key text, available boolean); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.set_feature_available(key text, available boolean) FROM PUBLIC;


--
-- Name: FUNCTION tg__add_audit_job(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg__add_audit_job() FROM PUBLIC;


--
-- Name: FUNCTION tg__add_job(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg__add_job() FROM PUBLIC;


--
-- Name: FUNCTION tg__ownership_info(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg__ownership_info() FROM PUBLIC;


--
-- Name: FUNCTION tg__refresh_registration_positions(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg__refresh_registration_positions() FROM PUBLIC;


--
-- Name: FUNCTION tg__registration_is_valid(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg__registration_is_valid() FROM PUBLIC;


--
-- Name: FUNCTION tg__reschedule_registration_reminders(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg__reschedule_registration_reminders() FROM PUBLIC;


--
-- Name: FUNCTION tg__schedule_registration_reminder(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg__schedule_registration_reminder() FROM PUBLIC;


--
-- Name: FUNCTION tg__timestamps(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg__timestamps() FROM PUBLIC;


--
-- Name: FUNCTION tg_registrations__queue_payment_refund(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg_registrations__queue_payment_refund() FROM PUBLIC;


--
-- Name: FUNCTION tg_registrations__snapshot_price(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg_registrations__snapshot_price() FROM PUBLIC;


--
-- Name: FUNCTION tg_user_email_secrets__insert_with_user_email(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg_user_email_secrets__insert_with_user_email() FROM PUBLIC;


--
-- Name: FUNCTION tg_user_secrets__insert_with_user(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.tg_user_secrets__insert_with_user() FROM PUBLIC;


--
-- Name: FUNCTION accept_invitation_to_organization(invitation_id uuid, code text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.accept_invitation_to_organization(invitation_id uuid, code text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.accept_invitation_to_organization(invitation_id uuid, code text) TO ilmo_visitor;


--
-- Name: FUNCTION admin_delete_registration(id uuid, refund boolean); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.admin_delete_registration(id uuid, refund boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.admin_delete_registration(id uuid, refund boolean) TO ilmo_visitor;


--
-- Name: FUNCTION admin_delete_user(id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.admin_delete_user(id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.admin_delete_user(id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION admin_list_users(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.admin_list_users() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.admin_list_users() TO ilmo_visitor;


--
-- Name: TABLE payments; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT ON TABLE app_public.payments TO ilmo_visitor;


--
-- Name: FUNCTION admin_mark_registration_paid(registration_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.admin_mark_registration_paid(registration_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.admin_mark_registration_paid(registration_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION admin_preview_features(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.admin_preview_features() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.admin_preview_features() TO ilmo_visitor;


--
-- Name: FUNCTION admin_send_payment_reminders(event_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.admin_send_payment_reminders(event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.admin_send_payment_reminders(event_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION admin_unmark_registration_paid(registration_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.admin_unmark_registration_paid(registration_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.admin_unmark_registration_paid(registration_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION admin_update_registration(id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.admin_update_registration(id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.admin_update_registration(id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION change_password(old_password text, new_password text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.change_password(old_password text, new_password text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.change_password(old_password text, new_password text) TO ilmo_visitor;


--
-- Name: PROCEDURE check_is_admin(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON PROCEDURE app_public.check_is_admin() FROM PUBLIC;
GRANT ALL ON PROCEDURE app_public.check_is_admin() TO ilmo_visitor;


--
-- Name: PROCEDURE check_is_developer(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON PROCEDURE app_public.check_is_developer() FROM PUBLIC;
GRANT ALL ON PROCEDURE app_public.check_is_developer() TO ilmo_visitor;


--
-- Name: PROCEDURE check_is_logged_in(IN message text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON PROCEDURE app_public.check_is_logged_in(IN message text) FROM PUBLIC;
GRANT ALL ON PROCEDURE app_public.check_is_logged_in(IN message text) TO ilmo_visitor;


--
-- Name: FUNCTION claim_registration_token(event_id uuid, quota_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.claim_registration_token(event_id uuid, quota_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.claim_registration_token(event_id uuid, quota_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION confirm_account_deletion(token text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.confirm_account_deletion(token text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.confirm_account_deletion(token text) TO ilmo_visitor;


--
-- Name: TABLE events; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.slug; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(slug),UPDATE(slug) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.name; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(name),UPDATE(name) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.description; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(description),UPDATE(description) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.location; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(location),UPDATE(location) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.event_start_time; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(event_start_time),UPDATE(event_start_time) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.event_end_time; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(event_end_time),UPDATE(event_end_time) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.registration_start_time; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(registration_start_time),UPDATE(registration_start_time) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.registration_end_time; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(registration_end_time),UPDATE(registration_end_time) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.is_highlighted; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(is_highlighted),UPDATE(is_highlighted) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.is_draft; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(is_draft),UPDATE(is_draft) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.header_image_file; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(header_image_file),UPDATE(header_image_file) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.open_quota_size; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(open_quota_size),UPDATE(open_quota_size) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.owner_organization_id; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(owner_organization_id),UPDATE(owner_organization_id) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.category_id; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(category_id),UPDATE(category_id) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.highlight_text; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(highlight_text),UPDATE(highlight_text) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.payment_mode; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(payment_mode),UPDATE(payment_mode) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: COLUMN events.send_unpaid_email_on_close; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(send_unpaid_email_on_close),UPDATE(send_unpaid_email_on_close) ON TABLE app_public.events TO ilmo_visitor;


--
-- Name: FUNCTION create_event(event app_public.event_input, quotas app_public.create_event_quotas[], questions app_public.create_event_questions[]); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.create_event(event app_public.event_input, quotas app_public.create_event_quotas[], questions app_public.create_event_questions[]) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.create_event(event app_public.event_input, quotas app_public.create_event_quotas[], questions app_public.create_event_questions[]) TO ilmo_visitor;


--
-- Name: FUNCTION validate_question_data(type app_public.question_type, data app_public.translated_field[]); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.validate_question_data(type app_public.question_type, data app_public.translated_field[]) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.validate_question_data(type app_public.question_type, data app_public.translated_field[]) TO ilmo_visitor;


--
-- Name: TABLE event_questions; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.event_questions TO ilmo_visitor;


--
-- Name: COLUMN event_questions.event_id; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(event_id) ON TABLE app_public.event_questions TO ilmo_visitor;


--
-- Name: COLUMN event_questions."position"; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT("position"),UPDATE("position") ON TABLE app_public.event_questions TO ilmo_visitor;


--
-- Name: COLUMN event_questions.type; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(type),UPDATE(type) ON TABLE app_public.event_questions TO ilmo_visitor;


--
-- Name: COLUMN event_questions.label; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(label),UPDATE(label) ON TABLE app_public.event_questions TO ilmo_visitor;


--
-- Name: COLUMN event_questions.is_required; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(is_required),UPDATE(is_required) ON TABLE app_public.event_questions TO ilmo_visitor;


--
-- Name: COLUMN event_questions.data; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(data),UPDATE(data) ON TABLE app_public.event_questions TO ilmo_visitor;


--
-- Name: COLUMN event_questions.prefill; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(prefill),UPDATE(prefill) ON TABLE app_public.event_questions TO ilmo_visitor;


--
-- Name: FUNCTION create_event_questions(event_id uuid, questions app_public.create_event_questions[]); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.create_event_questions(event_id uuid, questions app_public.create_event_questions[]) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.create_event_questions(event_id uuid, questions app_public.create_event_questions[]) TO ilmo_visitor;


--
-- Name: TABLE quotas; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.quotas TO ilmo_visitor;


--
-- Name: COLUMN quotas.event_id; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(event_id) ON TABLE app_public.quotas TO ilmo_visitor;


--
-- Name: COLUMN quotas."position"; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT("position"),UPDATE("position") ON TABLE app_public.quotas TO ilmo_visitor;


--
-- Name: COLUMN quotas.title; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(title),UPDATE(title) ON TABLE app_public.quotas TO ilmo_visitor;


--
-- Name: COLUMN quotas.size; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(size),UPDATE(size) ON TABLE app_public.quotas TO ilmo_visitor;


--
-- Name: COLUMN quotas.price_cents; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(price_cents),UPDATE(price_cents) ON TABLE app_public.quotas TO ilmo_visitor;


--
-- Name: FUNCTION create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.create_event_quotas(event_id uuid, quotas app_public.create_event_quotas[]) TO ilmo_visitor;


--
-- Name: TABLE organizations; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT ON TABLE app_public.organizations TO ilmo_visitor;


--
-- Name: COLUMN organizations.slug; Type: ACL; Schema: app_public; Owner: -
--

GRANT UPDATE(slug) ON TABLE app_public.organizations TO ilmo_visitor;


--
-- Name: COLUMN organizations.name; Type: ACL; Schema: app_public; Owner: -
--

GRANT UPDATE(name) ON TABLE app_public.organizations TO ilmo_visitor;


--
-- Name: COLUMN organizations.color; Type: ACL; Schema: app_public; Owner: -
--

GRANT UPDATE(color) ON TABLE app_public.organizations TO ilmo_visitor;


--
-- Name: FUNCTION create_organization(slug public.citext, name text, color text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.create_organization(slug public.citext, name text, color text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.create_organization(slug public.citext, name text, color text) TO ilmo_visitor;


--
-- Name: FUNCTION create_registration("registrationToken" text, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email public.citext, answers jsonb); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.create_registration("registrationToken" text, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email public.citext, answers jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.create_registration("registrationToken" text, "eventId" uuid, "quotaId" uuid, "firstName" text, "lastName" text, email public.citext, answers jsonb) TO ilmo_visitor;


--
-- Name: TABLE reminder_preferences; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT ON TABLE app_public.reminder_preferences TO ilmo_visitor;


--
-- Name: FUNCTION current_reminder_preferences(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_reminder_preferences() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_reminder_preferences() TO ilmo_visitor;


--
-- Name: FUNCTION current_session_id(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_session_id() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_session_id() TO ilmo_visitor;


--
-- Name: TABLE telegram_accounts; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT ON TABLE app_public.telegram_accounts TO ilmo_visitor;


--
-- Name: FUNCTION current_telegram_account(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_telegram_account() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_telegram_account() TO ilmo_visitor;


--
-- Name: FUNCTION "current_user"(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public."current_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public."current_user"() TO ilmo_visitor;


--
-- Name: FUNCTION current_user_has_event_permissions(event_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_user_has_event_permissions(event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_user_has_event_permissions(event_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION current_user_id(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_user_id() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_user_id() TO ilmo_visitor;


--
-- Name: FUNCTION current_user_invited_organization_ids(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_user_invited_organization_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_user_invited_organization_ids() TO ilmo_visitor;


--
-- Name: FUNCTION current_user_is_admin(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_user_is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_user_is_admin() TO ilmo_visitor;


--
-- Name: FUNCTION current_user_is_developer(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_user_is_developer() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_user_is_developer() TO ilmo_visitor;


--
-- Name: FUNCTION current_user_is_owner_organization_member(owner_organization_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_user_is_owner_organization_member(owner_organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_user_is_owner_organization_member(owner_organization_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION current_user_member_organization_ids(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.current_user_member_organization_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.current_user_member_organization_ids() TO ilmo_visitor;


--
-- Name: FUNCTION delete_organization(organization_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.delete_organization(organization_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.delete_organization(organization_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION delete_registration("updateToken" text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.delete_registration("updateToken" text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.delete_registration("updateToken" text) TO ilmo_visitor;


--
-- Name: FUNCTION delete_registration_profile(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.delete_registration_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.delete_registration_profile() TO ilmo_visitor;


--
-- Name: FUNCTION disconnect_telegram(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.disconnect_telegram() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.disconnect_telegram() TO ilmo_visitor;


--
-- Name: FUNCTION enable_event_reminder(event_id uuid, language text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.enable_event_reminder(event_id uuid, language text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.enable_event_reminder(event_id uuid, language text) TO ilmo_visitor;


--
-- Name: FUNCTION enabled_features(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.enabled_features() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.enabled_features() TO ilmo_visitor;


--
-- Name: FUNCTION events_payment_summary(e app_public.events); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.events_payment_summary(e app_public.events) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.events_payment_summary(e app_public.events) TO ilmo_visitor;


--
-- Name: FUNCTION events_signup_closed(e app_public.events); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.events_signup_closed(e app_public.events) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.events_signup_closed(e app_public.events) TO ilmo_visitor;


--
-- Name: FUNCTION events_signup_open(e app_public.events); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.events_signup_open(e app_public.events) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.events_signup_open(e app_public.events) TO ilmo_visitor;


--
-- Name: FUNCTION events_signup_upcoming(e app_public.events); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.events_signup_upcoming(e app_public.events) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.events_signup_upcoming(e app_public.events) TO ilmo_visitor;


--
-- Name: FUNCTION feature_enabled(key text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.feature_enabled(key text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.feature_enabled(key text) TO ilmo_visitor;


--
-- Name: FUNCTION feature_flag_events(flag_key text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.feature_flag_events(flag_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.feature_flag_events(flag_key text) TO ilmo_visitor;


--
-- Name: FUNCTION forgot_password(email public.citext); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.forgot_password(email public.citext) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.forgot_password(email public.citext) TO ilmo_visitor;


--
-- Name: FUNCTION invite_to_organization(organization_id uuid, username public.citext, email public.citext); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.invite_to_organization(organization_id uuid, username public.citext, email public.citext) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.invite_to_organization(organization_id uuid, username public.citext, email public.citext) TO ilmo_visitor;


--
-- Name: FUNCTION logout(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.logout() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.logout() TO ilmo_visitor;


--
-- Name: TABLE user_emails; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.user_emails TO ilmo_visitor;


--
-- Name: COLUMN user_emails.email; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(email) ON TABLE app_public.user_emails TO ilmo_visitor;


--
-- Name: FUNCTION make_email_primary(email_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.make_email_primary(email_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.make_email_primary(email_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION organization_for_invitation(invitation_id uuid, code text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.organization_for_invitation(invitation_id uuid, code text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.organization_for_invitation(invitation_id uuid, code text) TO ilmo_visitor;


--
-- Name: FUNCTION organizations_current_user_is_owner(org app_public.organizations); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.organizations_current_user_is_owner(org app_public.organizations) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.organizations_current_user_is_owner(org app_public.organizations) TO ilmo_visitor;


--
-- Name: FUNCTION registration_by_update_token("updateToken" text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.registration_by_update_token("updateToken" text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.registration_by_update_token("updateToken" text) TO ilmo_visitor;


--
-- Name: FUNCTION registrations_email(registration app_public.registrations); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.registrations_email(registration app_public.registrations) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.registrations_email(registration app_public.registrations) TO ilmo_visitor;


--
-- Name: FUNCTION registrations_full_name(registration app_public.registrations); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.registrations_full_name(registration app_public.registrations) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.registrations_full_name(registration app_public.registrations) TO ilmo_visitor;


--
-- Name: FUNCTION registrations_payment_status(registration app_public.registrations); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.registrations_payment_status(registration app_public.registrations) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.registrations_payment_status(registration app_public.registrations) TO ilmo_visitor;


--
-- Name: FUNCTION registrations_position(registration app_public.registrations); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.registrations_position(registration app_public.registrations) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.registrations_position(registration app_public.registrations) TO ilmo_visitor;


--
-- Name: FUNCTION registrations_status(registration app_public.registrations); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.registrations_status(registration app_public.registrations) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.registrations_status(registration app_public.registrations) TO ilmo_visitor;


--
-- Name: FUNCTION remove_from_organization(organization_id uuid, user_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.remove_from_organization(organization_id uuid, user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.remove_from_organization(organization_id uuid, user_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION request_account_deletion(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.request_account_deletion() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.request_account_deletion() TO ilmo_visitor;


--
-- Name: FUNCTION request_telegram_link(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.request_telegram_link() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.request_telegram_link() TO ilmo_visitor;


--
-- Name: FUNCTION resend_email_verification_code(email_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.resend_email_verification_code(email_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.resend_email_verification_code(email_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION save_reminder_preferences(minutes_before integer, delivery_method text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.save_reminder_preferences(minutes_before integer, delivery_method text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.save_reminder_preferences(minutes_before integer, delivery_method text) TO ilmo_visitor;


--
-- Name: FUNCTION set_admin_status(id uuid, is_admin boolean); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.set_admin_status(id uuid, is_admin boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.set_admin_status(id uuid, is_admin boolean) TO ilmo_visitor;


--
-- Name: FUNCTION set_event_registration_reminder(event_id uuid, enabled boolean, language text, minutes_before integer, delivery_method text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.set_event_registration_reminder(event_id uuid, enabled boolean, language text, minutes_before integer, delivery_method text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.set_event_registration_reminder(event_id uuid, enabled boolean, language text, minutes_before integer, delivery_method text) TO ilmo_visitor;


--
-- Name: TABLE feature_flags; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT ON TABLE app_public.feature_flags TO ilmo_visitor;


--
-- Name: FUNCTION set_feature_flag(key text, state app_public.feature_state); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.set_feature_flag(key text, state app_public.feature_state) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.set_feature_flag(key text, state app_public.feature_state) TO ilmo_visitor;


--
-- Name: TABLE registration_profiles; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.registration_profiles TO ilmo_visitor;


--
-- Name: COLUMN registration_profiles.user_id; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(user_id) ON TABLE app_public.registration_profiles TO ilmo_visitor;


--
-- Name: COLUMN registration_profiles.telegram; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(telegram),UPDATE(telegram) ON TABLE app_public.registration_profiles TO ilmo_visitor;


--
-- Name: COLUMN registration_profiles.dietary_restrictions; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(dietary_restrictions),UPDATE(dietary_restrictions) ON TABLE app_public.registration_profiles TO ilmo_visitor;


--
-- Name: FUNCTION set_registration_profile(telegram text, dietary_restrictions text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.set_registration_profile(telegram text, dietary_restrictions text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.set_registration_profile(telegram text, dietary_restrictions text) TO ilmo_visitor;


--
-- Name: FUNCTION supported_languages(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.supported_languages() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.supported_languages() TO ilmo_visitor;


--
-- Name: FUNCTION tg__graphql_subscription(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.tg__graphql_subscription() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.tg__graphql_subscription() TO ilmo_visitor;


--
-- Name: FUNCTION tg_user_emails__forbid_if_verified(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.tg_user_emails__forbid_if_verified() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.tg_user_emails__forbid_if_verified() TO ilmo_visitor;


--
-- Name: FUNCTION tg_user_emails__prevent_delete_last_email(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.tg_user_emails__prevent_delete_last_email() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.tg_user_emails__prevent_delete_last_email() TO ilmo_visitor;


--
-- Name: FUNCTION tg_user_emails__verify_account_on_verified(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.tg_user_emails__verify_account_on_verified() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.tg_user_emails__verify_account_on_verified() TO ilmo_visitor;


--
-- Name: FUNCTION tg_users__deletion_organization_checks_and_actions(); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.tg_users__deletion_organization_checks_and_actions() FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.tg_users__deletion_organization_checks_and_actions() TO ilmo_visitor;


--
-- Name: FUNCTION transfer_organization_ownership(organization_id uuid, user_id uuid); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.transfer_organization_ownership(organization_id uuid, user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.transfer_organization_ownership(organization_id uuid, user_id uuid) TO ilmo_visitor;


--
-- Name: FUNCTION update_event(id uuid, event app_public.event_input, quotas app_public.update_event_quotas[], questions app_public.update_event_questions[]); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.update_event(id uuid, event app_public.event_input, quotas app_public.update_event_quotas[], questions app_public.update_event_questions[]) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.update_event(id uuid, event app_public.event_input, quotas app_public.update_event_quotas[], questions app_public.update_event_questions[]) TO ilmo_visitor;


--
-- Name: FUNCTION update_event_questions(event_id uuid, questions app_public.update_event_questions[]); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.update_event_questions(event_id uuid, questions app_public.update_event_questions[]) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.update_event_questions(event_id uuid, questions app_public.update_event_questions[]) TO ilmo_visitor;


--
-- Name: FUNCTION update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.update_event_quotas(event_id uuid, quotas app_public.update_event_quotas[]) TO ilmo_visitor;


--
-- Name: FUNCTION update_registration("updateToken" text, "firstName" text, "lastName" text, answers jsonb); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.update_registration("updateToken" text, "firstName" text, "lastName" text, answers jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.update_registration("updateToken" text, "firstName" text, "lastName" text, answers jsonb) TO ilmo_visitor;


--
-- Name: FUNCTION users_has_password(u app_public.users); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.users_has_password(u app_public.users) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.users_has_password(u app_public.users) TO ilmo_visitor;


--
-- Name: FUNCTION users_primary_email(u app_public.users); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.users_primary_email(u app_public.users) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.users_primary_email(u app_public.users) TO ilmo_visitor;


--
-- Name: FUNCTION validate_jsonb_no_nulls(input anyelement); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.validate_jsonb_no_nulls(input anyelement) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.validate_jsonb_no_nulls(input anyelement) TO ilmo_visitor;


--
-- Name: FUNCTION validate_registration_answers(event_id uuid, required_question_ids uuid[], answers jsonb); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.validate_registration_answers(event_id uuid, required_question_ids uuid[], answers jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.validate_registration_answers(event_id uuid, required_question_ids uuid[], answers jsonb) TO ilmo_visitor;


--
-- Name: FUNCTION verify_email(user_email_id uuid, token text); Type: ACL; Schema: app_public; Owner: -
--

REVOKE ALL ON FUNCTION app_public.verify_email(user_email_id uuid, token text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_public.verify_email(user_email_id uuid, token text) TO ilmo_visitor;


--
-- Name: TABLE registrations_status_and_position; Type: ACL; Schema: app_hidden; Owner: -
--

GRANT SELECT ON TABLE app_hidden.registrations_status_and_position TO ilmo_visitor;


--
-- Name: TABLE event_categories; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.event_categories TO ilmo_visitor;


--
-- Name: COLUMN event_categories.name; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(name),UPDATE(name) ON TABLE app_public.event_categories TO ilmo_visitor;


--
-- Name: COLUMN event_categories.description; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(description),UPDATE(description) ON TABLE app_public.event_categories TO ilmo_visitor;


--
-- Name: COLUMN event_categories.owner_organization_id; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(owner_organization_id),UPDATE(owner_organization_id) ON TABLE app_public.event_categories TO ilmo_visitor;


--
-- Name: COLUMN event_categories.color; Type: ACL; Schema: app_public; Owner: -
--

GRANT INSERT(color),UPDATE(color) ON TABLE app_public.event_categories TO ilmo_visitor;


--
-- Name: TABLE event_registration_reminders; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.event_registration_reminders TO ilmo_visitor;


--
-- Name: TABLE organization_memberships; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT ON TABLE app_public.organization_memberships TO ilmo_visitor;


--
-- Name: TABLE user_authentications; Type: ACL; Schema: app_public; Owner: -
--

GRANT SELECT,DELETE ON TABLE app_public.user_authentications TO ilmo_visitor;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: app_hidden; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE ilmo IN SCHEMA app_hidden GRANT SELECT,USAGE ON SEQUENCES TO ilmo_visitor;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: app_hidden; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE ilmo IN SCHEMA app_hidden GRANT ALL ON FUNCTIONS TO ilmo_visitor;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: app_public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE ilmo IN SCHEMA app_public GRANT SELECT,USAGE ON SEQUENCES TO ilmo_visitor;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: app_public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE ilmo IN SCHEMA app_public GRANT ALL ON FUNCTIONS TO ilmo_visitor;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE ilmo IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO ilmo_visitor;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE ilmo IN SCHEMA public GRANT ALL ON FUNCTIONS TO ilmo_visitor;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE ilmo REVOKE ALL ON FUNCTIONS FROM PUBLIC;


--
-- PostgreSQL database dump complete
--


