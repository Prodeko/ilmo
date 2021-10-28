import type { Task } from "graphile-worker"

// 60 days
const GDPR_ANONYMIZATION_TIMEOUT = 60

const task: Task = async (_payload, { query }) => {
  await query(
    `delete from app_public.registrations as r
      using
        app_public.events as e
      where
        r.event_id = e.id and
        age(current_timestamp, e.event_end_time) > interval '1 day' * $1
    `,
    [GDPR_ANONYMIZATION_TIMEOUT]
  )
}

export default task
