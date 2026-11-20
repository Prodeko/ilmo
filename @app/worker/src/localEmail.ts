import { promises as fs } from "node:fs"
import path from "node:path"

export interface LocalEmailSettings {
  transport: "sendgrid"
  allowedRecipients: string[]
}

export function parseLocalEmailSettings(value: unknown): LocalEmailSettings {
  const settings = value as LocalEmailSettings
  if (
    settings?.transport !== "sendgrid" ||
    !Array.isArray(settings.allowedRecipients) ||
    settings.allowedRecipients.length === 0 ||
    settings.allowedRecipients.some(
      (email) =>
        typeof email !== "string" || !/^[^\s<>@,;]+@[^\s<>@,;]+$/.test(email)
    )
  ) {
    throw new Error(
      "Invalid email.local.json: specify sendgrid and allowedRecipients"
    )
  }
  return {
    transport: "sendgrid",
    allowedRecipients: settings.allowedRecipients.map((email) =>
      email.toLowerCase()
    ),
  }
}

export async function getLocalEmailSettings(): Promise<
  LocalEmailSettings | undefined
> {
  // A developer's delivery override must never enable real email in Jest/CI.
  if (
    process.env.NODE_ENV === "production" ||
    process.env.JEST_WORKER_ID ||
    process.env.IN_TESTS === "1"
  )
    return
  let content: string
  try {
    content = await fs.readFile(
      path.join(__dirname, "../email.local.json"),
      "utf8"
    )
  } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }
  return parseLocalEmailSettings(JSON.parse(content))
}

export function localRecipientAllowed(
  recipient: string | string[],
  settings: LocalEmailSettings
) {
  const recipients = Array.isArray(recipient) ? recipient : [recipient]
  return (
    recipients.length > 0 &&
    recipients.every((email) =>
      settings.allowedRecipients.includes(email.trim().toLowerCase())
    )
  )
}
