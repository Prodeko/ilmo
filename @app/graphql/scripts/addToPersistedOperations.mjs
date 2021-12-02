import { promises as fsp } from "node:fs"
import { URL } from "url"

import map from "../server.json"

async function main() {
  const parent = new URL("..", import.meta.url).pathname
  const persistedOperationsDir = `${parent}/.persisted_operations/`
  await fsp.rmdir(persistedOperationsDir, { recursive: true })
  await fsp.mkdir(persistedOperationsDir)
  await Promise.all(
    Object.entries(map).map(([hash, query]) =>
      fsp.writeFile(`${persistedOperationsDir}/${hash}.graphql`, query)
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
