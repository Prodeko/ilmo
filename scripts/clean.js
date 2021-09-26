#!/usr/bin/env node
try {
  const rimraf = require("rimraf")
  const { execSync } = require("child_process")

  rimraf.sync(`${__dirname}/../@app/*/dist`)
  rimraf.sync(`${__dirname}/../@app/*/tsconfig.tsbuildinfo`)
  rimraf.sync(`${__dirname}/../@app/client/.next`)
  rimraf.sync(`${__dirname}/../@app/server/uploads/*`)
  rimraf.sync(`${__dirname}/../@app/graphql/index.*`)
  rimraf.sync(`${__dirname}/../@app/graphql/introspection.json`)
  rimraf.sync(`${__dirname}/../@app/graphql/introspection.min.json`)
  execSync("nx clear-cache", { stdio: "inherit" })
} catch (e) {
  console.error("Failed to clean up, perhaps rimraf isn't installed?")
  console.error(e)
}
