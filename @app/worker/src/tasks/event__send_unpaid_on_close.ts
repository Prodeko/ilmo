import { paymentsEnabled } from "../payments"

import type { PaymentReminderPayload } from "./payment__send_reminder"
import type { Task } from "graphile-worker"

/**
 * Close-of-registration payment email (PRD §6.9), run every minute from the
 * crontab. Finds events that collect payments, have the close email on, whose
 * registration has ended and whose close email hasn't been sent, and queues a
 * payment reminder (with `closed: true`) for every finished, unpaid
 * registration holding a spot.
 *
 * Runs once per event: `unpaid_close_email_sent_at` is set in the same
 * transaction that queues the reminders, and `for update skip locked` keeps
 * two overlapping runs from picking the same event. A no-op while payments
 * are disabled; events that closed meanwhile are handled once they are back
 * on.
 */
const task: Task = async (_payload, { withPgClient, logger }) => {
  if (!paymentsEnabled()) {
    return
  }

  await withPgClient(async (client) => {
    await client.query("begin")
    try {
      const { rows: events } = await client.query<{ id: string }>(
        `select e.id
          from app_public.events as e
          where
            e.payment_mode <> 'NONE'
            and e.send_unpaid_email_on_close is true
            and e.registration_end_time < now()
            and e.unpaid_close_email_sent_at is null
          order by e.registration_end_time
          for update skip locked`
      )

      for (const event of events) {
        await client.query(
          "update app_public.events set unpaid_close_email_sent_at = now() where id = $1",
          [event.id]
        )
        const { rows: registrations } = await client.query<{ id: string }>(
          `select r.id
            from app_public.registrations as r
            join app_hidden.registrations_status_and_position as s on s.id = r.id
            where
              r.event_id = $1
              and r.is_finished is true
              and s.status in ('IN_QUOTA', 'IN_OPEN_QUOTA')
              and app_private.registration_payment_status(r) = 'UNPAID'
            order by r.created_at`,
          [event.id]
        )
        for (const registration of registrations) {
          const payload: PaymentReminderPayload = {
            registrationId: registration.id,
            closed: true,
          }
          await client.query("select graphile_worker.add_job($1, $2::json)", [
            "payment__send_reminder",
            JSON.stringify(payload),
          ])
        }
        logger.info(
          `Registration closed for event ${event.id}: queued ${registrations.length} payment reminder(s)`
        )
      }
      await client.query("commit")
    } catch (e) {
      await client.query("rollback")
      throw e
    }
  })
}

export default task
