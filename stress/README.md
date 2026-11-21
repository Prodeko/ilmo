# Registration stress test

This simulates a contested registration opening against a production build of
ilmo. It runs under production-like limits:

- **Postgres:** `wal_level=replica`, with 10 connection slots for the ilmo roles
  (`max_connections=13`, `superuser_reserved_connections=3`).
- **Database owner:** not a superuser, so it can't use the reserved slots.
- **Server:** pinned to two cores with `taskset`.

## Running

Build an image of the source tree you want to test, then run a scenario:

```bash
stress/build-image.sh . ilmo-stress:latest
pnpm stress worst
```

| Scenario | Bots | Quotas       |
| -------- | ---- | ------------ |
| `worst`  | 400  | 5 × 5 spots  |
| `common` | 200  | 3 × 20 spots |

`--image <tag>` picks the image (default `ilmo-stress:latest`) and `--vus <n>`
overrides the bot count. Use `--vus 5` for a quick smoke test.

To compare against another commit, export it first:

```bash
mkdir -p /tmp/ilmo-<sha> && git archive <sha> | tar -x -C /tmp/ilmo-<sha>
stress/build-image.sh /tmp/ilmo-<sha> ilmo-stress:<sha>
```

`build-image.sh` builds the app's own Dockerfile. It feeds sharp's native
binaries in from `stress/.cache` because the GitHub download times out on slow
links.

## What a bot does

Each bot does the following:

1. Loads the event page some time before opening.
2. Holds the page's websocket subscriptions (`EventPage`, `CurrentTime`).
3. At opening, plus 0–1 s, runs the register page's query, subscribes to
   `EventRegistrations` and claims a registration token.
4. Waits 5–20 s, then submits the form.

10% of bots share one client IP, like a guild room, and the rest each get their
own.

## Results

Each run writes to `stress/results/<time>-<scenario>-<image>-<bots>/`:

| File                       | Contents                                                      |
| -------------------------- | ------------------------------------------------------------- |
| `summary.txt`              | The summary below.                                            |
| `seed.json`                | The seeded event and quota ids.                               |
| `k6.log`                   | Per-bot `RESULT` lines with claim time and errors, k6 errors. |
| `k6-summary.json`          | k6's metric summary.                                          |
| `k6-stdout.txt`            | k6's end-of-test report.                                      |
| `k6-exit-code`             | k6's exit code.                                               |
| `connections.csv`          | `pg_stat_activity` sampled every 200 ms.                      |
| `sampler.err`              | Errors from the connection sampler.                           |
| `server.log`, `worker.log` | Container logs.                                               |

| Summary line                                  | Meaning                                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| k6 exit code, k6 errors                       | Whether k6 itself ran cleanly; script exceptions are listed at the end.                                                |
| bots reporting                                | Bots that printed a result, against the number started.                                                                |
| claims ok / submits ok                        | Bots whose claim or submit returned data without GraphQL errors.                                                       |
| finished registrations in DB                  | Registrations with `is_finished` for the seeded event.                                                                 |
| register page query / claim / submit          | k6 request latencies.                                                                                                  |
| peak ilmo connections                         | Highest total of ilmo-role connections in any sample, and the number of samples.                                       |
| "remaining connection slots"                  | Postgres refusing new connections.                                                                                     |
| pool acquire timeouts                         | Requests that gave up waiting for a pool connection.                                                                   |
| max displacement, displaced by > 5            | Among bots with a finished registration: the gap, within a quota, between rank by claim time and rank by `created_at`. |
| earliest clickers who did not end up IN_QUOTA | Among the first `size` bots to claim for each quota, how many did not get a spot. Failed requests count here.          |
| failures by message                           | Every failed request, subscription error, unexpected websocket close and script exception, grouped.                    |

The checker exits non-zero and says the run is not trustworthy when k6 failed,
bots are missing, or no connection samples were taken.
