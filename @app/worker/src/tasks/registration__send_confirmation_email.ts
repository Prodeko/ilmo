import {
  buildRegistrationEmail,
  markRegistrationEmailSent,
} from "../registrationEmail"

import type { Task } from "graphile-worker"

export { getFormattedEventTime } from "../registrationEmail"

interface RegistrationSendConfirmationEmail {
  /**
   * registration id
   */
  id: string
}

const task: Task = async (inPayload, { addJob, query }) => {
  const payload: RegistrationSendConfirmationEmail = inPayload as any
  const { id: registrationId } = payload

  const email = await buildRegistrationEmail(
    query,
    registrationId,
    "confirmation"
  )
  if (!email) {
    return
  }

  await addJob("send_email", email)
  await markRegistrationEmailSent(query, registrationId, "confirmation")
}

export default task
