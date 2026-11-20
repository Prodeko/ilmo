#!/usr/bin/env node
// Guards against the two migration mistakes that make parallel pull requests
// collide. Uses only Node built-ins so CI can run it without installing.
//
//   node scripts/check-migrations.mjs current
//     Fails when two files in @app/db/migrations/current/ share a numeric
//     prefix, or when a file there has no numeric prefix.
//
//   node scripts/check-migrations.mjs committed <base-ref>
//     Fails when the changes since the merge base with <base-ref> touch
//     @app/db/migrations/committed/.
import { execFileSync } from "child_process"
import { readdirSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const CURRENT_DIR = "@app/db/migrations/current"
const COMMITTED_DIR = "@app/db/migrations/committed"

// Mirrors how graphile-migrate reads current/: dotfiles and non-SQL files are
// ignored, and the prefix is compared as a number, so 1-a.sql and 01-b.sql clash.
function checkCurrent() {
  const files = readdirSync(path.join(repoRoot, CURRENT_DIR))
    .filter((file) => !file.startsWith(".") && file.endsWith(".sql"))
    .sort()
  const byPrefix = new Map()
  const errors = []
  for (const file of files) {
    const match = /^(\d+)(-[-_a-zA-Z0-9]*)?\.sql$/.exec(file)
    const prefix = match ? parseInt(match[1], 10) : 0
    if (prefix < 1) {
      errors.push(
        `${CURRENT_DIR}/${file}: name must be NN-<feature>.sql with a positive number NN`
      )
      continue
    }
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file])
  }
  for (const [prefix, clashing] of byPrefix) {
    if (clashing.length > 1) {
      errors.push(
        `${CURRENT_DIR}: ${clashing.join(", ")} share the prefix ${prefix}; renumber one of them`
      )
    }
  }
  if (errors.length > 0) {
    errors.forEach((error) => console.error(`::error::${error}`))
    process.exit(1)
  }
  console.log(`${CURRENT_DIR}: ${files.length} file(s), prefixes are unique`)
}

function checkCommitted(baseRef) {
  if (!baseRef) {
    console.error("Usage: check-migrations.mjs committed <base-ref>")
    process.exit(2)
  }
  const changed = execFileSync(
    "git",
    ["diff", "--name-status", `${baseRef}...HEAD`, "--", COMMITTED_DIR],
    { cwd: repoRoot, encoding: "utf8" }
  ).trim()
  if (changed) {
    console.error(
      `::error::This pull request changes committed migrations. Put work in progress in ${CURRENT_DIR}/NN-<feature>.sql instead; maintainers commit migrations (see CONTRIBUTING.md).`
    )
    console.error(changed)
    process.exit(1)
  }
  console.log(`${COMMITTED_DIR}: unchanged since ${baseRef}`)
}

const [command, ...args] = process.argv.slice(2)
if (command === "current") {
  checkCurrent()
} else if (command === "committed") {
  checkCommitted(args[0])
} else {
  console.error("Usage: check-migrations.mjs current | committed <base-ref>")
  process.exit(2)
}
