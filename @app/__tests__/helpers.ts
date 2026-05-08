import { runTaskListOnce, SharedOptions, Task, TaskList } from "graphile-worker"
import { readdirSync } from "node:fs"
import { resolve } from "node:path"
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

      -- Delete graphile worker jobs (storage moved to _private_jobs in 0.16)
      delete from graphile_worker._private_jobs;
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
  await asRoot(client, () =>
    client.query("delete from graphile_worker._private_jobs")
  )
}

export const getJobs = async (
  client: PoolClient,
  taskIdentifier: string | null = null
) => {
  // graphile-worker 0.16 stores jobs in _private_jobs (task is a FK to
  // _private_tasks). The public `jobs` view does not expose `payload`, so
  // join the underlying tables directly to keep payload-based assertions
  // working.
  const { rows } = await asRoot(client, () =>
    client.query(
      `select
         jobs.*,
         tasks.identifier as task_identifier
       from graphile_worker._private_jobs as jobs
       inner join graphile_worker._private_tasks as tasks
         on tasks.id = jobs.task_id
       where $1::text is null or tasks.identifier = $1::text
       order by jobs.id asc`,
      [taskIdentifier]
    )
  )
  return rows
}

// graphile-worker 0.16's getTasks loads task files via dynamic `import()`,
// which jest 29 won't run without --experimental-vm-modules. Build the task
// list by requiring the compiled CJS tasks directly — it sidesteps the
// experimental flag and keeps the test runner in plain CJS.
const loadCompiledTasks = (): TaskList => {
  const tasksDir = resolve(`${__dirname}/../worker/dist/tasks`)
  const taskList: TaskList = {}
  for (const file of readdirSync(tasksDir)) {
    if (!file.endsWith(".js")) continue
    const name = file.slice(0, -3)
    const mod: { default?: Task } & Record<string, unknown> = require(
      resolve(tasksDir, file)
    )
    const task = mod.default
    if (typeof task !== "function") continue
    taskList[name] = task
  }
  return taskList
}

export const runJobs = async (client: PoolClient) => {
  return asRoot(client, async (client) => {
    const sharedOptions: SharedOptions = {}
    await runTaskListOnce(sharedOptions, loadCompiledTasks(), client)
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

export async function claimRegistrationToken(eventId: string, quotaId: string) {
  const pool = poolFromUrl(TEST_DATABASE_URL!)
  const client = await pool.connect()
  const {
    rows: [row],
  } = await client.query(
    `select * from app_public.claim_registration_token($1, $2)`,
    [eventId, quotaId]
  )
  await client.release()
  return {
    registrationToken: row.registration_token,
    updateToken: row.update_token,
  }
}

export const refreshMaterializedView = async (client: PoolClient) => {
  // Become root
  await client.query("reset role")
  client.query(
    "refresh materialized view app_hidden.registrations_status_and_position"
  )
}

export const getEmails = () => global["TEST_EMAILS"]

export const clearEmails = () => {
  global["TEST_EMAILS"] = []
}

beforeEach(clearEmails)
