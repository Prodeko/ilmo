import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import { timingSafeEqual } from "node:crypto"

import {
  handleTelegramUpdate,
  startTelegramPolling,
  TelegramUpdate,
} from "../telegram"

const Telegram: FastifyPluginAsync = async (app) => {
  if (
    !process.env.TELEGRAM_BOT_TOKEN ||
    process.env.IN_TESTS === "1" ||
    process.env.JEST_WORKER_ID
  )
    return
  const mode =
    process.env.TELEGRAM_UPDATE_MODE ||
    (process.env.NODE_ENV === "production" ? "webhook" : "polling")
  if (mode === "polling") {
    const stop = startTelegramPolling(app.rootPgPool)
    app.shutdownActions.push(stop)
    app.addHook("onClose", stop)
  } else if (mode === "webhook") {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret)
      throw new Error("TELEGRAM_WEBHOOK_SECRET is required in webhook mode")
    app.post("/telegram/webhook", { bodyLimit: 65536 }, async (req, reply) => {
      const header = req.headers["x-telegram-bot-api-secret-token"]
      if (
        typeof header !== "string" ||
        Buffer.byteLength(header) !== Buffer.byteLength(secret) ||
        !timingSafeEqual(Buffer.from(header), Buffer.from(secret))
      ) {
        return reply.code(403).send({ error: "Forbidden" })
      }
      if (!Number.isSafeInteger((req.body as TelegramUpdate)?.update_id))
        return reply.code(400).send({ error: "Invalid update" })
      await handleTelegramUpdate(app.rootPgPool, req.body as TelegramUpdate)
      return { ok: true }
    })
  } else throw new Error("TELEGRAM_UPDATE_MODE must be polling or webhook")
}

export default fp(Telegram)
