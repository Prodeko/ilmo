#!/usr/bin/env bash
# Seeds one event for a stress scenario and prints
# {"eventId","slug","quotaIds":[...],"registrationStartTime"} as JSON.
#
# Usage: stress/seed.sh <worst|common> <opens-in-seconds>
set -euo pipefail
cd "$(dirname "$0")"

scenario=$1
opens_in=$2
case $scenario in
  worst) quotas=5 size=5 ;;
  common) quotas=3 size=20 ;;
  *) echo "unknown scenario: $scenario" >&2; exit 1 ;;
esac

docker compose exec -T db psql -U postgres -d ilmo -At -v ON_ERROR_STOP=1 \
  -v quotas="$quotas" -v size="$size" -v opens_in="$opens_in" <<'SQL'
\set QUIET on
begin;
with org as (
  insert into app_public.organizations (slug, name, color)
  values ('stress-' || gen_random_uuid(), 'Stress', '#000000')
  returning id
), cat as (
  insert into app_public.event_categories (name, description, color, owner_organization_id)
  select '{"fi":"Stressi","en":"Stress"}', '{"fi":"x","en":"x"}', '#000000', id from org
  returning id, owner_organization_id
), ev as (
  insert into app_public.events (
    name, slug, description, location,
    event_start_time, event_end_time,
    registration_start_time, registration_end_time,
    is_draft, open_quota_size, owner_organization_id, category_id
  )
  select
    '{"fi":"Stressitapahtuma","en":"Stress event"}',
    'stress-' || extract(epoch from now())::bigint,
    '{"fi":[{"type":"paragraph","children":[{"text":"x"}]}],"en":[{"type":"paragraph","children":[{"text":"x"}]}]}',
    'Otaniemi',
    now() + interval '2 days', now() + interval '3 days',
    now() + make_interval(secs => :opens_in), now() + interval '1 day',
    false, 0, owner_organization_id, id
  from cat
  returning id, slug, registration_start_time
), q as (
  insert into app_public.quotas (event_id, position, title, size)
  select ev.id, i, jsonb_build_object('fi', 'Kiintiö ' || i, 'en', 'Quota ' || i), :size
  from ev, generate_series(0, :quotas - 1) i
  returning id, position
)
select json_build_object(
  'eventId', ev.id,
  'slug', ev.slug,
  'registrationStartTime', ev.registration_start_time,
  'quotaIds', (select json_agg(id order by position) from q)
)
from ev;
commit;
SQL
