import { promises as fsp } from "node:fs"
import path from "node:path"

const __dirname = new URL(".", import.meta.url).pathname
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
