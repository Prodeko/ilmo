#!/usr/bin/env node
// Summarises one stress run: failures, latencies, connection usage and how
// fairly spots were handed out compared with the order people clicked in.
//
// Usage: node stress/check-results.mjs <results-dir>
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Registrations further than this from their claim-order rank count as
// displaced. Smaller inversions are treated as network jitter.
const DISPLACEMENT_TOLERANCE = 5

const dir = process.argv[2]
const expectedBots = Number(process.argv[3])
const stressDir = dirname(fileURLToPath(import.meta.url))
const seed = JSON.parse(readFileSync(join(dir, "seed.json"), "utf8"))

// k6 log lines are JSON. Bot results are info lines starting with RESULT;
// error lines are k6's own (script exceptions, crashes) and are reported.
const results = []
const k6Errors = []
for (const line of readFileSync(join(dir, "k6.log"), "utf8")
  .split("\n")
  .filter(Boolean)) {
  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    k6Errors.push(line)
    continue
  }
  if (entry.msg?.startsWith("RESULT ")) {
    results.push(JSON.parse(entry.msg.slice(7)))
  } else if (entry.level === "error") {
    k6Errors.push(entry.msg)
  }
}
const k6ExitCode = existsSync(join(dir, "k6-exit-code"))
  ? readFileSync(join(dir, "k6-exit-code"), "utf8").trim()
  : "unknown"

const rows = JSON.parse(
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "ilmo",
      "-At",
      "-c",
      `select coalesce(json_agg(json_build_object(
         'email', r.email,
         'quotaId', r.quota_id,
         'createdAt', r.created_at,
         'status', app_public.registrations_status(r),
         'position', app_public.registrations_position(r)
       )), '[]')
       from app_public.registrations r
       where r.event_id = '${seed.eventId}' and r.is_finished`,
    ],
    { cwd: stressDir, encoding: "utf8" }
  )
)

// Failures grouped by step and message.
const errorCounts = {}
for (const r of results) {
  for (const e of r.errors) {
    const key = e.length > 140 ? e.slice(0, 140) + "…" : e
    errorCounts[key] = (errorCounts[key] || 0) + 1
  }
}

// Fairness: within each quota, compare rank by click time with rank by the
// registration's created_at, and check whether the first `size` clickers
// were the ones who got IN_QUOTA.
const byEmail = new Map(rows.map((r) => [r.email, r]))
const quotaSize = Object.fromEntries(
  JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        "postgres",
        "-d",
        "ilmo",
        "-At",
        "-c",
        `select json_agg(json_build_array(id, size)) from app_public.quotas where event_id = '${seed.eventId}'`,
      ],
      { cwd: stressDir, encoding: "utf8" }
    )
  )
)
let maxDisplacement = 0
let displaced = 0
let deservedButMissed = 0
for (const quotaId of seed.quotaIds) {
  const clicked = results
    .filter((r) => r.clickedAtMs && byEmail.get(r.email)?.quotaId === quotaId)
    .sort((a, b) => a.clickedAtMs - b.clickedAtMs)
  const byCreated = [...clicked].sort(
    (a, b) =>
      Date.parse(byEmail.get(a.email).createdAt) -
      Date.parse(byEmail.get(b.email).createdAt)
  )
  clicked.forEach((r, clickRank) => {
    const d = Math.abs(clickRank - byCreated.indexOf(r))
    maxDisplacement = Math.max(maxDisplacement, d)
    if (d > DISPLACEMENT_TOLERANCE) displaced++
  })
  // Of everyone who clicked for this quota (including those whose claim or
  // submit failed), the earliest `size` clickers deserved a spot.
  const allClickers = results
    .filter(
      (r) =>
        r.clickedAtMs && seed.quotaIds[r.vu % seed.quotaIds.length] === quotaId
    )
    .sort((a, b) => a.clickedAtMs - b.clickedAtMs)
  for (const r of allClickers.slice(0, quotaSize[quotaId])) {
    if (byEmail.get(r.email)?.status !== "IN_QUOTA") deservedButMissed++
  }
}

// Connections: peak of the per-sample total across ilmo roles.
const perSample = {}
const perSampleActive = {}
for (const line of readFileSync(join(dir, "connections.csv"), "utf8")
  .split("\n")
  .filter(Boolean)) {
  const [ts, , state, count] = line.split(",")
  perSample[ts] = (perSample[ts] || 0) + Number(count)
  if (state !== "idle") {
    perSampleActive[ts] = (perSampleActive[ts] || 0) + Number(count)
  }
}
const peak = (o) => Math.max(0, ...Object.values(o))
const sampleCount = Object.keys(perSample).length

const serverLog = readFileSync(join(dir, "server.log"), "utf8")
const slotErrors = (serverLog.match(/remaining connection slots/g) || []).length
const poolTimeouts = (
  serverLog.match(
    /timeout exceeded when trying to connect|connection terminated due to connection timeout/gi
  ) || []
).length

const k6 = existsSync(join(dir, "k6-summary.json"))
  ? JSON.parse(readFileSync(join(dir, "k6-summary.json"), "utf8"))
  : { metrics: {} }
const trend = (name) => {
  const m = k6.metrics[name]
  if (!m) return "n/a"
  const f = (v) => (v === undefined ? "n/a" : `${Math.round(v)}ms`)
  return `p50 ${f(m["p(50)"])}  p95 ${f(m["p(95)"])}  p99 ${f(m["p(99)"])}  max ${f(m.max)}`
}

const count = (pred) => results.filter(pred).length
const lines = [
  `run: ${dir}`,
  `k6 exit code: ${k6ExitCode}`,
  `bots reporting: ${results.length} / ${expectedBots} (missing ${expectedBots - results.length})`,
  `k6 errors: ${k6Errors.length}`,
  `claims ok: ${count((r) => r.claimOk)} / ${count((r) => r.clickedAtMs)}`,
  `submits ok: ${count((r) => r.submitOk)} / ${count((r) => r.claimOk)}`,
  `finished registrations in DB: ${rows.length}`,
  ``,
  `register page query: ${trend("register_page_query_duration")}`,
  `claim:               ${trend("claim_duration")}`,
  `submit:              ${trend("submit_duration")}`,
  ``,
  `peak ilmo connections: ${peak(perSample)} (non-idle ${peak(perSampleActive)}, ${sampleCount} samples)`,
  `"remaining connection slots" in server log: ${slotErrors}`,
  `pool acquire timeouts in server log: ${poolTimeouts}`,
  ``,
  `max displacement (claim-order rank vs created_at rank): ${maxDisplacement}`,
  `displaced by > ${DISPLACEMENT_TOLERANCE}: ${displaced}`,
  `earliest clickers per quota who did not end up IN_QUOTA: ${deservedButMissed}`,
  ``,
  `failures by message:`,
  ...Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `  ${String(n).padStart(4)}  ${m}`),
]
if (k6Errors.length) {
  lines.push(
    ``,
    `k6 errors (first 10):`,
    ...k6Errors.slice(0, 10).map((e) => `  ${e}`)
  )
}
const summary = lines.join("\n") + "\n"
writeFileSync(join(dir, "summary.txt"), summary)
process.stdout.write(summary)

const problems = []
if (k6ExitCode !== "0") problems.push(`k6 exited with ${k6ExitCode}`)
if (results.length !== expectedBots)
  problems.push(`${expectedBots - results.length} bots did not report`)
if (sampleCount === 0) problems.push("no connection samples (see sampler.err)")
if (problems.length) {
  process.stderr.write(`\nRUN IS NOT TRUSTWORTHY: ${problems.join("; ")}\n`)
  process.exitCode = 1
}
