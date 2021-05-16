import { Task } from "graphile-worker"

// 60 days
const GDPR_ANONYMIZATION_TIMEOUT = 60

const task: Task = async (_payload, { withPgClient }) => {
  try {
    await withPgClient(async (client) => {
      // Delete event registrations after GDPR_ANONYMIZATION_TIMEOUT
      await client.query({
        text: `
        with deleted_registrations as (
          delete from app_public.registrations as r
            using
              app_public.events as e
            where
              r.event_id = e.id and
              age(current_timestamp, e.event_end_time) > interval '1 day' * $1
            returning *)
        select count(*) from deleted_registrations
      `,
        values: [GDPR_ANONYMIZATION_TIMEOUT],
        rowMode: "array",
      })
    })
  } catch (e) {
    throw e
  }
}

module.exports = task
