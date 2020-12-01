--! Previous: sha1:9bc0603e22fd9e872b5221ca07b4dcabb4a64806
--! Hash: sha1:13d957047cc4f1782994ec6b6bcb1514c80343df

-- Enter migration here
create index on app_public.events using btree (start_time);

grant
  insert (start_time),
  update (start_time)
on app_public.events to :DATABASE_VISITOR;
