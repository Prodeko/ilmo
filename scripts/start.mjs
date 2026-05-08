#!/usr/bin/env node
import { spawn } from "child_process"
import { existsSync } from "fs"

import { dirname } from "./_setup_utils.mjs"

const __dirname = dirname(import.meta)
const ENVFILE = `${__dirname}/../.env`

if (!existsSync(ENVFILE)) {
  console.error("🛠️  Please run 'pnpm setup' before running 'pnpm start'")
  process.exit(1)
}

spawn("pnpm", ["dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    npm_config_loglevel: "silent",
  },
  shell: true,
})
