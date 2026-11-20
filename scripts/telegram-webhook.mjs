// Run with: node -r @app/config/env.js scripts/telegram-webhook.mjs [set|status|delete]
import telegram from "../@app/lib/dist/cjs/telegram.js"

try {
  const action = process.argv[2] || "status"
  if (action === "set") {
    const root = new URL(process.env.ROOT_URL)
    if (root.protocol !== "https:")
      throw new Error("Webhook mode requires an HTTPS ROOT_URL")
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret))
      throw new Error("Configure a valid TELEGRAM_WEBHOOK_SECRET first")
    await telegram.telegramRequest("setWebhook", {
      url: new URL("/telegram/webhook", root).href,
      secret_token: secret,
      allowed_updates: ["message", "my_chat_member", "callback_query"],
    })
    console.log("Telegram webhook configured")
  } else if (action === "delete") {
    await telegram.telegramRequest("deleteWebhook", {})
    console.log("Telegram webhook removed; polling may now be started")
  } else if (action === "status") {
    const info = await telegram.telegramRequest("getWebhookInfo", {})
    console.log(
      info.url ? "Telegram webhook is active" : "No Telegram webhook configured"
    )
    console.log("Pending updates:", info.pending_update_count)
  } else throw new Error("Usage: telegram-webhook.mjs [set|status|delete]")
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
