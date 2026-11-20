import type { Task } from "graphile-worker"

// An MCP session is recreated from the next valid access token, so deleting an
// idle one costs nothing but a row insert.
const INACTIVITY_TIMEOUT_MINUTES = 60

const task: Task = async (_, { query }) => {
  await query(
    `delete from app_private.sessions
      where kind = 'mcp'
        and last_active < now() - interval '1 minute' * $1`,
    [INACTIVITY_TIMEOUT_MINUTES]
  )
}

export default task
