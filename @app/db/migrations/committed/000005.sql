--! Previous: sha1:fcf4bd037cc3f298f864d5f8fb732dc5729e269a
--! Hash: sha1:9bc0603e22fd9e872b5221ca07b4dcabb4a64806

-- Enter migration here
alter table events
  drop column if exists start_time;

alter table events
  add column start_time timestamp not null default now();
