const { spawn } = require("child_process")
const fs = require("fs")

if (process.env.IN_TESTS === "1") {
  process.exit(0)
}

const connectionString = process.env.GM_DBURL
if (!connectionString) {
  console.error(
    "This script should only be called from a graphile-migrate action."
  )
  process.exit(1)
}

// pg_dump emits a few lines that vary across runs/versions and would otherwise
// cause a stable, committed schema dump to look perpetually out of date:
//   \restrict / \unrestrict <random-token>   (pg_dump 16.5+, fresh nonce per run)
//   -- Dumped from database version ...      (server build string)
//   -- Dumped by pg_dump version ...         (client build string)
//   SET transaction_timeout = 0;             (only emitted by pg_dump 17+)
const NOISE =
  /^(\\restrict\s|\\unrestrict\s|-- Dumped (from|by)\s|SET transaction_timeout\b)/

const outPath = "../../data/schema.sql"
const out = fs.createWriteStream(outPath)

const child = spawn(
  process.env.PG_DUMP || "pg_dump",
  [
    "--no-sync",
    "--schema-only",
    "--no-owner",
    "--exclude-schema=graphile_migrate",
    "--exclude-schema=graphile_worker",
    connectionString,
  ],
  { stdio: ["ignore", "pipe", "inherit"] }
)

let pending = ""
child.stdout.on("data", (chunk) => {
  pending += chunk.toString()
  const lines = pending.split("\n")
  pending = lines.pop()
  for (const line of lines) {
    if (!NOISE.test(line)) out.write(line + "\n")
  }
})

child.stdout.on("end", () => {
  if (pending && !NOISE.test(pending)) out.write(pending)
  out.end()
})

child.on("error", (err) => {
  console.error(err)
  process.exit(1)
})

child.on("exit", (code) => {
  if (code !== 0) process.exit(code)
})
