import dayjs from "dayjs"

import { registrationCalendarInvitation } from "../calendarInvitation"

import type { InvitationEvent } from "../calendarInvitation"
import type { SendEmailPayload } from "./send_email"
import type { Task } from "graphile-worker"

interface RegistrationSendConfirmationEmail {
  /**
   * registration id
   */
  id: string
}

export function getFormattedEventTime(event: any) {
  const { event_start_time, event_end_time } = event
  const formatString = "D.M.YY HH:mm"
  const startTime = dayjs(event_start_time).format(formatString)
  const endTime = dayjs(event_end_time).format(formatString)
  return `${startTime} - ${endTime}`
}

const task: Task = async (inPayload, { addJob, query }) => {
  const { ROOT_URL } = process.env
  const payload: RegistrationSendConfirmationEmail = inPayload as any
  const { id: registrationId } = payload
  const {
    rows: [registration],
  } = await query(
    "select r.*, app_public.registrations_status(r) as status from app_public.registrations r where id = $1",
    [registrationId]
  )
  if (!registration) {
    console.error("Registration not found; aborting")
    return
  }
  if (!registration.is_finished) return

  const {
    rows: [event],
  } = await query<InvitationEvent>(
    "select * from app_public.events where id = $1",
    [registration.event_id]
  )

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
  const isWaitlisted = registration.status === "IN_QUEUE"

  const sendEmailPayload: SendEmailPayload = {
    options: {
      to: email,
      subject: event.name.fi
        ? `${event.name.fi} - ${isWaitlisted ? "Ilmoittautuminen jonoon" : "Ilmoittautuminen onnistui"}`
        : `${event.name.en} - ${isWaitlisted ? "Added to waiting list" : "Registration successful"}`,
      ...(["IN_QUOTA", "IN_OPEN_QUOTA"].includes(registration.status)
        ? { icalEvent: registrationCalendarInvitation(event, email, ROOT_URL!) }
        : {}),
    },
    template: "event_registration.mjml.njk",
    variables: {
      isWaitlisted,
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
