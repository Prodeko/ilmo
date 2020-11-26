--! Previous: sha1:2e188c7c66db89a0094a2de40b2a4aa91c444cc9
--! Hash: sha1:fcf4bd037cc3f298f864d5f8fb732dc5729e269a

-- Enter migration here
alter table app_public.events
  drop column category_id;

alter table app_public.events
  add column category_id uuid not null references app_public.event_categories;

create index on app_public.events (category_id);

grant
  insert (category_id),
  update (category_id)
on app_public.events to :DATABASE_VISITOR;
