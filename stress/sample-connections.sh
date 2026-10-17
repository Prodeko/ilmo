#!/usr/bin/env bash
# Samples Postgres connections held by ilmo roles every 200 ms until killed.
# Writes "epoch_ms,usename,state,count" lines to the given file.
#
# Usage: stress/sample-connections.sh <outfile>
set -uo pipefail
cd "$(dirname "$0")"
out=$1
: > "$out"
container=$(docker compose ps -q db)
while true; do
  docker exec "$container" psql -U postgres -At -F, -c "
    select (extract(epoch from clock_timestamp()) * 1000)::bigint, usename, coalesce(state, '-'), count(*)
    from pg_stat_activity
    where usename like 'ilmo%'
    group by usename, state" >> "$out" 2>/dev/null
  sleep 0.2
done
