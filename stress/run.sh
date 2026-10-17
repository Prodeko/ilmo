#!/usr/bin/env bash
# Runs one registration stampede against a fresh stack and prints a summary.
#
# Usage: pnpm stress <worst|common> [--image <tag>] [--vus <n>]
set -euo pipefail
cd "$(dirname "$0")"

scenario=${1:?usage: run.sh <worst|common> [--image <tag>] [--vus <n>]}
shift
export IMAGE=ilmo-stress:after
case $scenario in
  worst) vus=400 ;;
  common) vus=200 ;;
  *) echo "unknown scenario: $scenario" >&2; exit 1 ;;
esac
while [[ $# -gt 0 ]]; do
  case $1 in
    --image) IMAGE=$2; shift 2 ;;
    --vus) vus=$2; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

opens_in=45
out="results/$(date +%Y%m%d-%H%M%S)-$scenario-${IMAGE//[:\/]/_}-$vus"
mkdir -p "$out"
# k6 runs as an unprivileged user inside its container.
chmod 777 "$out"

echo "==> fresh stack with $IMAGE"
docker compose down -v --remove-orphans >/dev/null 2>&1 || true
docker compose up -d --wait server worker >/dev/null
up=false
for _ in $(seq 1 90); do
  curl -sf -o /dev/null http://localhost:5678/ && up=true && break
  sleep 1
done
if ! $up; then
  echo "server did not come up; last log lines:" >&2
  docker compose logs --tail 30 server >&2
  exit 1
fi

echo "==> seeding $scenario (opens in ${opens_in}s)"
./seed.sh "$scenario" "$opens_in" > "$out/seed.json"
cat "$out/seed.json"

./sample-connections.sh "$out/connections.csv" &
sampler=$!
trap 'kill $sampler 2>/dev/null || true' EXIT

echo "==> k6 with $vus VUs"
docker run --rm --network host \
  -v "$(cd .. && pwd)":/repo:ro \
  -v "$(pwd)/$out":/out \
  -e SEED="$(cat "$out/seed.json")" -e VUS="$vus" -e REPO=/repo \
  grafana/k6:0.54.0 run --quiet --log-format json \
  --summary-export /out/k6-summary.json \
  /repo/stress/k6/registration.js 2> "$out/k6.log" > "$out/k6-stdout.txt" || true

# Let the worker drain and the last unfinished-registration state settle.
sleep 3
kill $sampler 2>/dev/null || true
docker compose logs server > "$out/server.log" 2>&1
docker compose logs worker > "$out/worker.log" 2>&1

node check-results.mjs "$out"
