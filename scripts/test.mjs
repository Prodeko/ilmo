#!/usr/bin/env node

import { execSync, spawnSync as rawSpawnSync } from "child_process"

import concurrently from "concurrently"
import pg from "pg"

import "@app/config/env.js"

function spawnSync(cmd, args, options) {
  const result = rawSpawnSync(cmd, args, {
    stdio: ["pipe", "inherit", "inherit"],
    env: {
      ...process.env,
      npm_config_loglevel: "silent",
    },
    shell: true,
    ...options,
  })

  const { error, status, signal, stderr, stdout } = result

  if (error) {
    throw error
  }

  if (status || signal) {
    if (stdout) {
      console.log(stdout.toString("utf8"))
    }
    if (stderr) {
      console.error(stderr.toString("utf8"))
    }
    if (status) {
      throw new Error(
        `Process exited with status '${status}' (running '${cmd} ${
          args ? args.join(" ") : ""
        }')`
      )
    } else {
      throw new Error(
        `Process exited due to signal '${signal}' (running '${cmd} ${
          args ? args.join(" ") : null
        }')`
      )
    }
  }

  return result
}

// Dear graphile-migrate, please treat the test DB as if it were the shadow DB
process.env.SHADOW_DATABASE_URL = process.env.TEST_DATABASE_URL

// Signal to graphile-migrate scripts that we're in the tests
process.env.IN_TESTS = "1"
process.env.NODE_ENV = "test"

// Don't log graphile-worker job successes in tests
process.env.NO_LOG_SUCCESS = true

// Every feature flag is off by default, which is what CI runs. As a local,
// on-demand option, TEST_FEATURE_FLAGS=on switches every flag on and available
// after the test database is rebuilt; test cleanup resets the flags to the
// same baseline, see resetFeatureFlags in @app/__tests__/helpers.ts.
const featureFlagBaseline = process.env.TEST_FEATURE_FLAGS || "off"
if (!["off", "on"].includes(featureFlagBaseline)) {
  throw new Error(
    `TEST_FEATURE_FLAGS must be "off" or "on", not "${featureFlagBaseline}"`
  )
}

async function switchAllFeatureFlagsOn() {
  const client = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
  })
  await client.connect()
  try {
    const { rowCount } = await client.query(
      "update app_public.feature_flags set state = 'on', available = true"
    )
    console.log(`TEST_FEATURE_FLAGS=on: switched ${rowCount} flag(s) on`)
  } finally {
    await client.end()
  }
}

const cmdArgs = process.argv.slice(2)
const watchMode = cmdArgs.find(
  (arg) => arg === "--watch" || arg === "--watchAll"
)
const delayArg = cmdArgs.indexOf("--delay")
let delaySeconds = null
if (delayArg > -1) {
  delaySeconds = parseFloat(cmdArgs[delayArg + 1])
  if (isNaN(delaySeconds)) {
    throw new Error("Did not get a valid delay argument in seconds.")
  }
  setTimeout(runMain, delaySeconds * 1000)
} else {
  runMain()
}

function runMain() {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

async function main() {
  const opts = {
    stdio: "inherit",
    cwd: process.cwd(),
  }

  // Reset the test database
  execSync("pnpm --filter @app/db run gm reset --shadow --erase", opts)
  execSync("pnpm --filter @app/db run watch --once --shadow", opts)
  if (featureFlagBaseline === "on") {
    await switchAllFeatureFlagsOn()
  }

  if (watchMode) {
    // We're in watch mode, so keep watching the `current.sql` file
    concurrently(
      [
        {
          name: "jest",
          command: `node --inspect=9876 ./node_modules/jest/bin/jest.js -i ${watchMode}`,
          prefixColor: "greenBright",
        },
        {
          name: "testdb",
          command: "pnpm --filter @app/db run watch --shadow",
          prefixColor: "blue",
        },
      ],
      {
        killOthers: ["failure"],
      }
    )
  } else {
    // Run once, so just run the tests. The tests share one database and
    // must run one file at a time. Jest's in-band mode (-i, --runInBand)
    // keeps every file in this one process, whose heap grows with each file
    // until Node runs out of memory, so run the files in a single worker
    // instead: jest restarts it when it passes workerIdleMemoryLimit
    // (jest.config.ts). Both flags are accepted and mean the same here. The
    // worker's heap limit is raised above that threshold so that the file
    // which crosses it can still finish.
    const jestArgs = cmdArgs.filter(
      (arg) => arg !== "--delay" && arg !== "-i" && arg !== "--runInBand"
    )
    spawnSync("jest", ["--maxWorkers=1", ...jestArgs], {
      ...opts,
      env: {
        ...process.env,
        npm_config_loglevel: "silent",
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=4096"]
          .filter(Boolean)
          .join(" "),
      },
    })
  }
}
