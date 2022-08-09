#!/usr/bin/env node

import { execSync } from "child_process"
import { basename, dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const projectName = basename(dirname(resolve(__dirname, ".."))).replace(
  /[^a-z0-9]/g,
  ""
)

try {
  execSync(
    `docker volume rm ${projectName}_vscode-extensions ${projectName}_devcontainer_db-volume ${projectName}_devcontainer_node_modules-volume ${projectName}_devcontainer_vscode-extensions`,
    { stdio: "inherit" }
  )
} catch (e) {
  /* noop */
}
