/*
 * Highlighted events carry a ribbon on the event card. Its text used to be a
 * fixed translation ("Nätti tapahtuma!"); `highlight_text` lets the event
 * creator write their own, per language. A null value, or a missing language,
 * falls back to the default translation in the client.
 */

alter table app_public.events add column if not exists highlight_text translated_field;

comment on column app_public.events.highlight_text is
  E'Text shown on the ribbon of a highlighted event.';

grant
  insert (highlight_text),
  update (highlight_text)
on app_public.events to :DATABASE_VISITOR;

alter type app_public.event_input drop attribute if exists highlight_text;
alter type app_public.event_input add attribute highlight_text translated_field;

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

  return v_event;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;

/*
 * `highlight_text` is not coalesced like the other fields: a null must be able
 * to clear a previously written text. It is instead updated together with
 * `is_highlighted`, so partial updates that leave both out keep the old text.
 */
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

  return v_event;
end;
$$ language plpgsql volatile security invoker set search_path = pg_catalog, public, pg_temp;
