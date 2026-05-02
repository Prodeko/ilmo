const { writeFile } = require("fs").promises
const pg = require("pg")

if (process.env.IN_TESTS !== "1") {
  process.exit(0)
}

async function main() {
  const connectionString = process.env.GM_DBURL
  if (!connectionString) {
    throw new Error("GM_DBURL not set!")
  }
  const pgPool = new pg.Pool({ connectionString })
  try {
    // graphile-worker 0.16 split storage into _private_jobs and exposed
    // jobs as a non-updatable view. Targeting the storage table directly is
    // the supported way to wipe the queue for tests.
    await pgPool.query("delete from graphile_worker._private_jobs;")
    await writeFile(
      `${__dirname}/../__tests__/jest.watch.hack.ts`,
      `export const ts = ${Date.now()}\n`
    )
  } finally {
    await pgPool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
