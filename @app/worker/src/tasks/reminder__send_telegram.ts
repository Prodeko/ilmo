import { withFeature } from "../featureFlags"

import { registrationReminderTask } from "./reminder__send_registration"

/** Sends the Telegram message of a registration reminder, whatever the flags. */
export const sendRegistrationReminderTelegram =
  registrationReminderTask("telegram")

// Telegram reminders are registration reminders: both flags must be on. A
// reminder that comes due while either is off is not sent later.
export default withFeature(
  "registration_reminders",
  withFeature("telegram_reminders", sendRegistrationReminderTelegram)
)
