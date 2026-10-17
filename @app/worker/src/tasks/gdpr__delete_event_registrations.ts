import type { Task } from "graphile-worker"

// 60 days
const GDPR_ANONYMIZATION_TIMEOUT = 60

const task: Task = async (_payload, { query }) => {
  // Deleting registrations long after the event is data retention, not a
  // cancellation, so card payments are not refunded: the CTE turns off
  // ilmo.refund_deleted_registrations (read by the _200_queue_payment_refund
  // trigger) for this statement's transaction before any row is deleted.
  // Payment rows are kept (their registration_id becomes null) for
  // bookkeeping.
  await query(
    `with no_refunds as (
        select set_config('ilmo.refund_deleted_registrations', 'off', true)
      )
      delete from app_public.registrations as r
      using
        app_public.events as e
      where
        r.event_id = e.id and
        age(current_timestamp, e.event_end_time) > interval '1 day' * $1 and
        exists (select 1 from no_refunds)
    `,
    [GDPR_ANONYMIZATION_TIMEOUT]
  )
}

export default task
