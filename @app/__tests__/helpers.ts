import { getTasks, runTaskListOnce, SharedOptions } from "graphile-worker"
import { Pool, PoolClient } from "pg"

export {
  constructAnswersFromQuestions,
  createEventCategories,
  createEvents,
  createOrganizations,
  createQuestions,
  createQuotas,
  createRegistrations,
  createRegistrationSecrets,
  createSession,
  createUsers,
} from "./data"

const pools = {}

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Cannot run tests without a TEST_DATABASE_URL")
}
export const TEST_DATABASE_URL: string = process.env.TEST_DATABASE_URL

if (process.env.IN_TESTS) {
  // Make sure we release those pgPools so that our tests exit!
  afterAll(() => {
    const keys = Object.keys(pools)
    return Promise.all(
      keys.map(async (key) => {
        try {
          const pool = pools[key]
          delete pools[key]
          await pool.end()
        } catch (e) {
          console.error("Failed to release connection!")
          console.error(e)
        }
      })
    )
  })
}

export const poolFromUrl = (url: string) => {
  if (!pools[url]) {
    pools[url] = new Pool({ connectionString: url })
  }
  return pools[url]
}

export const deleteTestUsers = (pool: Pool) => {
  // We're not using withRootDb because we don't want the transaction rolled back
  return pool.query(
    `delete from app_public.users
      where username like 'testuser%'
      or username = 'testuser'
      or id in (select user_id from app_public.user_emails where email like 'testuser%@example.com')`
  )
}

export const deleteTestEventData = (pool: Pool) => {
  // We're not using withRootDb because we don't want the transaction rolled back
  return pool.query(
    `BEGIN;
      delete from app_private.registration_secrets;
      delete from app_public.registrations;
      delete from app_public.quotas;
      delete from app_public.events;
      delete from app_public.event_categories;
      delete from app_public.event_questions;
      delete from app_public.organizations;

      delete from app_private.sessions;

      -- Delete graphile worker jobs
      delete from graphile_worker.jobs;
    COMMIT;`
  )
}

export const deleteTestData = async () => {
  const pool = poolFromUrl(TEST_DATABASE_URL)
  await deleteTestUsers(pool)
  await deleteTestEventData(pool)
}

/* Quickly becomes root, does the thing, and then reverts back to previous role */
export const asRoot = async <T>(
  client: PoolClient,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const {
    rows: [{ role }],
  } = await client.query("select current_setting('role') as role")
  await client.query("reset role")
  try {
    return await callback(client)
  } finally {
    try {
      await client.query("select set_config('role', $1, true)", [role])
    } catch (e) {
      // Transaction was probably aborted, don't clobber the error
    }
  }
}

/******************************************************************************/
// Job helpers

export const clearJobs = async (client: PoolClient) => {
  await asRoot(client, () => client.query("delete from graphile_worker.jobs"))
}

export const getJobs = async (
  client: PoolClient,
  taskIdentifier: string | null = null
) => {
  const { rows } = await asRoot(client, () =>
    client.query(
      "select * from graphile_worker.jobs where $1::text is null or task_identifier = $1::text order by id asc",
      [taskIdentifier]
    )
  )
  return rows
}

export const runJobs = async (client: PoolClient) => {
  return asRoot(client, async (client) => {
    const sharedOptions: SharedOptions = {}
    const taskList = await getTasks(
      sharedOptions,
      `${__dirname}/../worker/dist/tasks`
    )
    await runTaskListOnce(sharedOptions, taskList.tasks, client)
  })
}

export const assertJobComplete = async (
  client: PoolClient,
  job: { id: string }
) => {
  return asRoot(client, async (client) => {
    const {
      rows: [row],
    } = await client.query("select * from graphile_worker.jobs where id = $1", [
      job.id,
    ])
    expect(row).toBeFalsy()
  })
}
