import { getFormattedEventTime } from "./registration__send_confirmation_email"

import type { SendEmailPayload } from "./send_email"
import type { RegistrationStatusAndPosition } from "@app/lib"
import type { Task } from "graphile-worker"

interface RegistrationProcessQueue {
  /**
   * registration id
   */
  receivedSpot: RegistrationStatusAndPosition
}

const { ROOT_URL } = process.env

const task: Task = async (inPayload, { addJob, query }) => {
  const payload: RegistrationProcessQueue = inPayload as any
  const { receivedSpot } = payload

  const {
    rows: [registrationSecret],
  } = await query(
    "select * from app_private.registration_secrets where registration_id = $1",
    [receivedSpot.id]
  )

  if (!registrationSecret) {
    console.error("No registration secrets found; aborting")
    return
  }

  if (registrationSecret.received_spot_from_queue_email_sent) {
    console.error("Received spot from queue email already sent; aborting")
    return
  }

  const {
    rows: [registration],
  } = await query("select * from app_public.registrations where id = $1", [
    receivedSpot.id,
  ])
  const {
    rows: [event],
  } = await query("select * from app_public.events where id = $1", [
    receivedSpot.event_id,
  ])
  const {
    rows: [quota],
  } = await query("select * from app_public.quotas where id = $1", [
    receivedSpot.quota_id,
  ])
  if (!event || !quota) {
    console.error("Event or quota not found; aborting")
    return
  }
  const { email, first_name, last_name } = registration

  if (!email) {
    console.error("No email specified; aborting")
    return
  }

  const sendEmailPayload: SendEmailPayload = {
    options: {
      to: email,
      subject: event.name.fi
        ? `${event.name.fi} - Olet saanut paikan jonosta`
        : `${event.name.en} - You have received a spot from the queue`,
    },
    template: "spot_from_queue.mjml.njk",
    variables: {
      url: ROOT_URL,
      eventName: event.name,
      registrationName: `${first_name} ${last_name}`,
      registrationQuota: quota.title,
      eventTime: getFormattedEventTime(event),
      eventSlug: event.slug,
      eventLocation: event.location,
      eventRegistrationUpdateLink: `update-registration/${registrationSecret.update_token}`,
    },
  }

  await addJob("send_email", sendEmailPayload)
  await query(
    "update app_private.registration_secrets set received_spot_from_queue_email_sent = true where registration_id = $1",
    [receivedSpot.id]
  )
}

export default task
