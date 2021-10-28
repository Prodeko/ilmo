import type { SendEmailPayload } from "./send_email"
import type { Task } from "graphile-worker"

interface UserSendAccountDeletionEmailPayload {
  /**
   * email address
   */
  email: string

  /**
   * secret token
   */
  token: string
}

const task: Task = async (inPayload, { addJob }) => {
  const payload: UserSendAccountDeletionEmailPayload = inPayload as any
  const { email, token } = payload
  const sendEmailPayload: SendEmailPayload = {
    options: {
      to: email,
      subject: "Confirmation required: really delete account?",
    },
    template: "delete_account.mjml.njk",
    variables: {
      token,
      deleteAccountLink: `${
        process.env.ROOT_URL
      }/settings/delete?token=${encodeURIComponent(token)}`,
    },
  }
  await addJob("send_email", sendEmailPayload)
}

export default task
