#!/usr/bin/env node
import { execSync } from "child_process"

import { rimrafSync } from "rimraf"

import { dirname } from "./_setup_utils.mjs"

const __dirname = dirname(import.meta)
const opts = { glob: true }

try {
  rimrafSync(`${__dirname}/../@app/*/dist`, opts)
  rimrafSync(`${__dirname}/../@app/*/tsconfig.tsbuildinfo`, opts)
  rimrafSync(`${__dirname}/../@app/client/.next`, opts)
  rimrafSync(`${__dirname}/../@app/server/uploads/*`, opts)
  rimrafSync(`${__dirname}/../@app/graphql/index.*`, opts)
  rimrafSync(`${__dirname}/../@app/graphql/introspection.json`, opts)
  rimrafSync(`${__dirname}/../@app/graphql/introspection.min.json`, opts)
  rimrafSync(`${__dirname}/../@app/e2e/cypress/downloads/*`, opts)
  execSync("nx clear-cache", { stdio: "inherit" })
} catch (e) {
  console.error("Failed to clean up, perhaps rimraf isn't installed?")
  console.error(e)
}
