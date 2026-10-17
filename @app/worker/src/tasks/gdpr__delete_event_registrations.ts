import type { Task } from "graphile-worker"

// 60 days
const GDPR_ANONYMIZATION_TIMEOUT = 60

const task: Task = async (_payload, { withPgClient }) => {
  // Deleting registrations long after the event is data retention, not a
  // cancellation, so card payments are not refunded: the transaction turns
  // off ilmo.refund_deleted_registrations (read by the
  // _200_queue_payment_refund trigger) before any row is deleted. Payment
  // rows are kept (their registration_id becomes null) for bookkeeping.
  await withPgClient(async (client) => {
    await client.query("begin")
    try {
      await client.query(
        "select set_config('ilmo.refund_deleted_registrations', 'off', true)"
      )
      await client.query(
        `delete from app_public.registrations as r
          using
            app_public.events as e
          where
            r.event_id = e.id and
            age(current_timestamp, e.event_end_time) > interval '1 day' * $1
        `,
        [GDPR_ANONYMIZATION_TIMEOUT]
      )
      await client.query("commit")
    } catch (e) {
      await client.query("rollback")
      throw e
    }
  })
}

export default task
