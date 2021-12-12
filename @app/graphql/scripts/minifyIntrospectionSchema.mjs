import { promises as fsp } from "node:fs"
import path from "node:path"

import { minifyIntrospectionQuery } from "@urql/introspection"

const __dirname = new URL(".", import.meta.url).pathname
const introspection = await fsp.readFile(
  path.join(__dirname, "..", "introspection.json"),
  "utf-8"
)
const schema = JSON.parse(introspection)

async function main() {
  const minifiedSchema = minifyIntrospectionQuery(schema)
  await fsp.writeFile(
    "./introspection.min.json",
    JSON.stringify(minifiedSchema)
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
