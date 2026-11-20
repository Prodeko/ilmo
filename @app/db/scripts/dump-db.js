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

const pgDumpArgs = [
  "--no-sync",
  "--schema-only",
  "--no-owner",
  "--exclude-schema=graphile_migrate",
  "--exclude-schema=graphile_worker",
]

// On Windows there's usually no local pg_dump, so run one in a throwaway
// Docker container instead. CI dumps with pg_dump 16+, whose output differs
// from the db container's pg_dump 14, so use a postgres:16 image and reach the
// host-mapped port through host.docker.internal. Set PG_DUMP to force a local
// binary, or PG_DUMP_DOCKER_IMAGE to pick another image.
const dockerImage =
  process.env.PG_DUMP_DOCKER_IMAGE ||
  (process.platform === "win32" && !process.env.PG_DUMP ? "postgres:16" : "")

let command, args
if (dockerImage) {
  const url = new URL(connectionString)
  if (["localhost", "127.0.0.1"].includes(url.hostname)) {
    url.hostname = "host.docker.internal"
  }
  command = "docker"
  args = ["run", "--rm", dockerImage, "pg_dump", ...pgDumpArgs, url.toString()]
} else {
  command = process.env.PG_DUMP || "pg_dump"
  args = [...pgDumpArgs, connectionString]
}

const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] })

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
