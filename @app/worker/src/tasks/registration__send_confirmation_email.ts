import dayjs from "dayjs"

import type { SendEmailPayload } from "./send_email"
import type { Task } from "graphile-worker"

interface RegistrationSendConfirmationEmail {
  /**
   * registration id
   */
  id: string
}

const { ROOT_URL } = process.env

export function getFormattedEventTime(event: any) {
  const { event_start_time, event_end_time } = event
  const formatString = "D.M.YY HH:mm"
  const startTime = dayjs(event_start_time).format(formatString)
  const endTime = dayjs(event_end_time).format(formatString)
  return `${startTime} - ${endTime}`
}

const task: Task = async (inPayload, { addJob, query }) => {
  const payload: RegistrationSendConfirmationEmail = inPayload as any
  const { id: registrationId } = payload
  const {
    rows: [registration],
  } = await query("select * from app_public.registrations where id = $1", [
    registrationId,
  ])
  if (!registration) {
    console.error("Registration not found; aborting")
    return
  }

  const {
    rows: [event],
  } = await query("select * from app_public.events where id = $1", [
    registration.event_id,
  ])

  if (!event) {
    console.error("No event found; aborting")
    return
  }

  const {
    rows: [quota],
  } = await query("select * from app_public.quotas where id = $1", [
    registration.quota_id,
  ])

  if (!quota) {
    console.error("No quota found; aborting")
    return
  }

  const {
    rows: [registrationSecret],
  } = await query(
    "select * from app_private.registration_secrets where registration_id = $1",
    [registration.id]
  )

  if (!registrationSecret) {
    console.error("No registration secrets found; aborting")
    return
  }

  if (registrationSecret.confirmation_email_sent) {
    console.error("Confirmation email already sent; aborting")
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
        ? `${event.name.fi} - Rekisteröinti onnnistui`
        : `${event.name.en} - Registration successful`,
    },
    template: "event_registration.mjml.njk",
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
    "update app_private.registration_secrets set confirmation_email_sent = true where registration_id = $1",
    [registrationId]
  )
}

export default task
