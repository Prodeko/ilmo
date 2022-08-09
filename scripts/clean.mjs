#!/usr/bin/env node
import rimraf from "rimraf"
import { execSync } from "child_process"
import { dirname } from "./_setup_utils.mjs"

const __dirname = dirname(import.meta)

try {
  rimraf.sync(`${__dirname}/../@app/*/dist`)
  rimraf.sync(`${__dirname}/../@app/*/tsconfig.tsbuildinfo`)
  rimraf.sync(`${__dirname}/../@app/client/.next`)
  rimraf.sync(`${__dirname}/../@app/server/uploads/*`)
  rimraf.sync(`${__dirname}/../@app/graphql/index.*`)
  rimraf.sync(`${__dirname}/../@app/graphql/introspection.json`)
  rimraf.sync(`${__dirname}/../@app/graphql/introspection.min.json`)
  rimraf.sync(`${__dirname}/../@app/e2e/cypress/downloads/*`)
  execSync("nx clear-cache", { stdio: "inherit" })
} catch (e) {
  console.error("Failed to clean up, perhaps rimraf isn't installed?")
  console.error(e)
}
