import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

import { startTelegramPolling } from "../telegram"
import { telegramUpdateMode } from "../telegramWebhook"

/**
 * Receives Telegram bot updates by polling, for development and servers
 * without a public HTTPS address. Webhook mode is an external route (see
 * telegramWebhook.ts) and is not handled here. Never polls inside automated
 * tests. The poller does nothing while `telegram_reminders` is off.
 */
const TelegramPolling: FastifyPluginAsync = async (app) => {
  if (
    !process.env.TELEGRAM_BOT_TOKEN ||
    process.env.IN_TESTS === "1" ||
    process.env.JEST_WORKER_ID
  ) {
    return
  }
  const mode = telegramUpdateMode()
  if (mode === "webhook") {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
      app.log.error(
        "TELEGRAM_WEBHOOK_SECRET is required in Telegram webhook mode; the webhook is not registered"
      )
    }
    return
  }
  if (mode !== "polling") {
    throw new Error("TELEGRAM_UPDATE_MODE must be polling or webhook")
  }
  const stop = startTelegramPolling(app.rootPgPool)
  app.shutdownActions.push(stop)
  app.addHook("onClose", stop)
}

export default fp(TelegramPolling)
