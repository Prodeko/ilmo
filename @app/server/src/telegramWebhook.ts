import { timingSafeEqual } from "node:crypto"

import { handleTelegramUpdate, TelegramUpdate } from "./telegram"

import type { ExternalRouteModule } from "./externalRoutes"

export const TELEGRAM_WEBHOOK_PATH = "/telegram/webhook"

/**
 * How the server receives bot updates: "webhook" (Telegram calls
 * TELEGRAM_WEBHOOK_PATH) or "polling" (the server asks Telegram, see
 * installTelegramPolling). Defaults to webhook in production.
 */
export function telegramUpdateMode(env = process.env): string {
  return (
    env.TELEGRAM_UPDATE_MODE ||
    (env.NODE_ENV === "production" ? "webhook" : "polling")
  )
}

function secretMatches(header: unknown, secret: string) {
  return (
    typeof header === "string" &&
    Buffer.byteLength(header) === Buffer.byteLength(secret) &&
    timingSafeEqual(Buffer.from(header), Buffer.from(secret))
  )
}

/**
 * The Telegram bot webhook. Telegram authenticates each call with the
 * secret token registered with the webhook, not with a browser session, so
 * the route is exempt from the CSRF check. It exists only in webhook mode
 * with both the bot token and the secret set; otherwise the path is neither
 * registered nor exempt.
 */
export const telegramWebhook: ExternalRouteModule = {
  name: "telegram",
  paths: [{ method: "POST", path: TELEGRAM_WEBHOOK_PATH, csrfExempt: true }],
  feature: "telegram_reminders",
  configured: () =>
    telegramUpdateMode() === "webhook" &&
    Boolean(process.env.TELEGRAM_BOT_TOKEN) &&
    Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
  register: async (app) => {
    app.post(
      TELEGRAM_WEBHOOK_PATH,
      { bodyLimit: 65536 },
      async (req, reply) => {
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET
        if (
          !secret ||
          !secretMatches(req.headers["x-telegram-bot-api-secret-token"], secret)
        ) {
          return reply.code(403).send({ error: "Forbidden" })
        }
        const update = req.body as TelegramUpdate
        if (!Number.isSafeInteger(update?.update_id)) {
          return reply.code(400).send({ error: "Invalid update" })
        }
        await handleTelegramUpdate(app.rootPgPool, update)
        return { ok: true }
      }
    )
  },
}
