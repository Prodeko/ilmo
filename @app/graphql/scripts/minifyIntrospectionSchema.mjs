import { promises as fsp } from "fs"

import { minifyIntrospectionQuery } from "@urql/introspection"

import schema from "../introspection.json"

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
