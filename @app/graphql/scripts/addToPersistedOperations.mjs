import { promises as fsp } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const allowedQueries = await fsp.readFile(
  path.join(__dirname, "..", "server.json"),
  "utf-8"
)
const map = JSON.parse(allowedQueries)

async function main() {
  const persistedOperationsDir = path.join(
    __dirname,
    "..",
    ".persisted_operations/"
  )
  await fsp.rm(persistedOperationsDir, { recursive: true, force: true })
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
