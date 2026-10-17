# Registration stress test

This simulates a contested registration opening against a production build of ilmo. It runs under production-like limits:

- **Postgres:** `wal_level=replica`, with 10 connection slots for the ilmo roles (`max_connections=13`, `superuser_reserved_connections=3`).
- **Database owner:** not a superuser, so it can't use the reserved slots.
- **Server:** pinned to two cores with `taskset`.

## Running

Build an image of the source tree you want to test, then run a scenario:

```bash
stress/build-image.sh . ilmo-stress:after
pnpm stress worst --image ilmo-stress:after
```

| Scenario | Bots | Quotas |
|---|---|---|
| `worst` | 400 | 5 × 5 spots |
| `common` | 200 | 3 × 20 spots |

`--vus <n>` overrides the bot count. Use `--vus 5` for a quick smoke test.

To compare against another commit, export it first:

```bash
git archive <sha> | tar -x -C /tmp/ilmo-<sha>
stress/build-image.sh /tmp/ilmo-<sha> ilmo-stress:<sha>
```

`build-image.sh` builds the app's own Dockerfile. It feeds sharp's native binaries in from `stress/.cache` because the GitHub download times out on slow links.

## What a bot does

Each bot does the following:

1. Loads the event page some time before opening.
2. Holds the page's websocket subscriptions (`EventPage`, `CurrentTime`).
3. At opening, plus 0–1 s, runs the register page's query, subscribes to `EventRegistrations` and claims a registration token.
4. Waits 5–20 s, then submits the form.

10% of bots share one client IP, like a guild room, and the rest each get their own.

## Results

Each run writes to `stress/results/<time>-<scenario>-<image>-<bots>/`:

| File | Contents |
|---|---|
| `summary.txt` | The summary below. |
| `k6.log` | Per-bot `RESULT` lines with click time and errors. |
| `connections.csv` | `pg_stat_activity` sampled every 200 ms. |
| `server.log`, `worker.log` | Container logs. |

| Summary line | Meaning |
|---|---|
| claims ok / submits ok | Bots whose claim or submit returned data without GraphQL errors. |
| register page query / claim / submit | k6 request latencies. |
| peak ilmo connections | Highest total of ilmo-role connections in any sample. |
| "remaining connection slots" | Postgres refusing new connections. |
| max displacement | Largest gap, within a quota, between a bot's rank by click time and its rank by registration `created_at`. |
| earliest clickers who did not end up IN_QUOTA | Among the first `size` bots to click for each quota, how many did not get a spot. Failed requests count here. |
| failures by message | Every failed request or subscription error, grouped. |
