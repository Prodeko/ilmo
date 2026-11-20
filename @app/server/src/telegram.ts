import {
  detectedTelegramLanguage,
  TelegramError,
  telegramRequest,
} from "@app/lib/dist/cjs/telegram"
import { Pool, PoolClient } from "pg"

interface TelegramUser {
  id: number
  username?: string
  language_code?: string
  is_bot?: boolean
}

export interface TelegramUpdate {
  update_id: number
  message?: {
    text?: string
    chat: { id: number; type: string }
    from?: TelegramUser
  }
  callback_query?: {
    id: string
    from: TelegramUser
    data?: string
    message?: { chat: { id: number; type: string } }
  }

  my_chat_member?: {
    chat: { id: number; type: string }
    new_chat_member: { status: string }
  }
}

// A repeated webhook or poll must not consume the code again or unlink again.
export async function processTelegramUpdate(
  client: PoolClient,
  update: TelegramUpdate
) {
  if (!Number.isSafeInteger(update?.update_id)) return
  const claimed = await client.query(
    "insert into app_private.telegram_updates(update_id) values($1) on conflict do nothing returning update_id",
    [update.update_id]
  )
  if (!claimed.rowCount) return
  await client.query(
    "delete from app_private.telegram_updates where processed_at < now() - interval '7 days'"
  )
  const membership = update.my_chat_member
  if (
    membership?.chat.type === "private" &&
    membership.new_chat_member.status === "kicked"
  ) {
    await client.query(
      "select app_private.disconnect_telegram(user_id) from app_public.telegram_accounts where chat_id = $1",
      [membership.chat.id]
    )
    return
  }
  const callback = update.callback_query
  const message = update.message
  const chat = callback ? callback.message?.chat : message?.chat
  const from = callback ? callback.from : message?.from
  // A button may only change the preferences of its private-chat owner.
  if (
    !chat ||
    chat.type !== "private" ||
    !from ||
    from.is_bot ||
    !Number.isSafeInteger(chat.id) ||
    chat.id <= 0 ||
    from.id !== chat.id
  )
    return
  const callbackLanguage = callback?.data?.match(/^language:(en|fi|auto)$/)?.[1]
  if (callback && !callbackLanguage) return
  await client.query(
    `insert into app_private.telegram_preferences(chat_id, detected_language)
     values($1, $2) on conflict(chat_id) do update
     set detected_language = case when $3 then excluded.detected_language else telegram_preferences.detected_language end`,
    [
      chat.id,
      detectedTelegramLanguage(from.language_code),
      !!from.language_code,
    ]
  )
  const command = message?.text?.match(
    /^\/(start|stop|language)(?:@[A-Za-z0-9_]+)?(?:\s+([^\s]+))?\s*$/
  )
  if (!command && !callbackLanguage) return
  let reply: string
  if (callbackLanguage || command?.[1] === "language") {
    const choice = callbackLanguage || command?.[2]
    if (choice && ["en", "fi", "auto"].includes(choice)) {
      await client.query(
        "update app_private.telegram_preferences set language = $2 where chat_id = $1",
        [chat.id, choice]
      )
      reply = "languageSaved"
    } else reply = "languageMenu"
  } else if (command?.[1] === "stop") {
    await client.query(
      "select app_private.disconnect_telegram(user_id) from app_public.telegram_accounts where chat_id = $1",
      [chat.id]
    )
    reply = "disconnected"
  } else if (command?.[2]) {
    const {
      rows: [result],
    } = await client.query(
      "select app_private.connect_telegram($1, $2, $3) as connected",
      [command[2], chat.id, from.username || null]
    )
    reply = result.connected ? "connected" : "invalidLink"
  } else reply = "welcome"
  // Resolve the language in the worker, so queued replies follow later changes too.
  await client.query(
    "select graphile_worker.add_job('telegram__reply', $1::json, queue_name := 'telegram-reminders')",
    [
      JSON.stringify({
        chatId: chat.id,
        reply,
        ...(callback ? { callbackQueryId: callback.id } : {}),
      }),
    ]
  )
}

export async function handleTelegramUpdate(pool: Pool, update: TelegramUpdate) {
  const client = await pool.connect()
  try {
    await client.query("begin")
    await processTelegramUpdate(client, update)
    await client.query("commit")
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}

export function startTelegramPolling(pool: Pool) {
  let stopped = false
  let wake: (() => void) | undefined
  const done = (async () => {
    // Session advisory lock prevents two local servers from polling the same bot.
    const client = await pool.connect()
    try {
      const {
        rows: [lock],
      } = await client.query(
        "select pg_try_advisory_lock(478433, 1) as acquired"
      )
      if (!lock.acquired) return
      try {
        let checkedWebhook = false
        while (!stopped) {
          try {
            if (!checkedWebhook) {
              const info = await telegramRequest<{ url: string }>(
                "getWebhookInfo",
                {}
              )
              if (info.url) {
                console.error(
                  "Telegram has an active webhook; polling was not started"
                )
                return
              }
              checkedWebhook = true
              console.log(
                "Telegram polling started for @" +
                  (process.env.TELEGRAM_BOT_USERNAME || "IlmoReminderBot")
              )
            }
            const {
              rows: [state],
            } = await client.query(
              "select next_offset from app_private.telegram_poll_state where id"
            )
            const updates = await telegramRequest<TelegramUpdate[]>(
              "getUpdates",
              {
                offset: Number(state.next_offset),
                timeout: 20,
                allowed_updates: [
                  "message",
                  "my_chat_member",
                  "callback_query",
                ],
              }
            )
            for (const update of updates) {
              if (stopped) break
              await client.query("begin")
              try {
                await processTelegramUpdate(client, update)
                await client.query(
                  "update app_private.telegram_poll_state set next_offset = greatest(next_offset, $1) where id",
                  [update.update_id + 1]
                )
                await client.query("commit")
              } catch (error) {
                await client.query("rollback")
                throw error
              }
            }
          } catch (error) {
            // Sanitized errors only; no bot tokens or linking codes.
            console.error(
              "Telegram polling:",
              error instanceof TelegramError
                ? `API ${error.code}`
                : "connection or processing failed"
            )
            if (!stopped)
              await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, 5000)
                wake = () => {
                  clearTimeout(timer)
                  resolve()
                }
              })
          }
        }
      } finally {
        await client.query("select pg_advisory_unlock(478433, 1)")
      }
    } catch {
      console.error(
        "Telegram polling could not start; check bot configuration and database migrations"
      )
    } finally {
      client.release()
    }
  })()
  return async () => {
    stopped = true
    wake?.()
    await done
  }
}
