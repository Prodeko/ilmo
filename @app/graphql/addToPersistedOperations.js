const map = require("./server.json")
const { promises: fsp } = require("fs")

async function main() {
  const persistedOperationsDir = `${__dirname}/.persisted_operations/`
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
