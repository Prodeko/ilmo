import {
  buildRegistrationEmail,
  markRegistrationEmailSent,
} from "../registrationEmail"

import type { RegistrationStatusAndPosition } from "@app/lib"
import type { Task } from "graphile-worker"

interface RegistrationProcessQueue {
  /**
   * registration id
   */
  receivedSpot: RegistrationStatusAndPosition
}

const task: Task = async (inPayload, { addJob, query }) => {
  const payload: RegistrationProcessQueue = inPayload as any
  const { receivedSpot } = payload

  const email = await buildRegistrationEmail(
    query,
    receivedSpot.id,
    "spotFromQueue"
  )
  if (!email) {
    return
  }

  await addJob("send_email", email)
  await markRegistrationEmailSent(query, receivedSpot.id, "spotFromQueue")
}

export default task
