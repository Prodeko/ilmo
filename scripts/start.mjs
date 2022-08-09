#!/usr/bin/env node
import { existsSync } from "fs"
import { spawn } from "child_process"
import { dirname } from "./_setup_utils.mjs"

const __dirname = dirname(import.meta)
const ENVFILE = `${__dirname}/../.env`

if (!existsSync(ENVFILE)) {
  console.error("🛠️  Please run 'yarn setup' before running 'yarn start'")
  process.exit(1)
}

spawn("yarn", ["dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    npm_config_loglevel: "silent",
  },
  shell: true,
})
