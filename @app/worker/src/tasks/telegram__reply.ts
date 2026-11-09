import {
  resolveTelegramLanguage,
  TelegramError,
  telegramLanguageKeyboard,
  TelegramReply,
  telegramReplyText,
  telegramRequest,
} from "@app/lib/dist/cjs/telegram"

import type { Task } from "graphile-worker"

const task: Task = async (payload, { withPgClient }) => {
  // Keep supporting text-only jobs queued before the language feature deployment.
  const { chatId, text, reply, callbackQueryId } = payload as {
    chatId: number
    text?: string
    reply?: TelegramReply
    callbackQueryId?: string
  }
  try {
    if (callbackQueryId) {
      try {
        await telegramRequest("answerCallbackQuery", {
          callback_query_id: callbackQueryId,
        })
      } catch (error) {
        // Callback acknowledgements expire; a retry must still deliver the reply.
        if (!(error instanceof TelegramError && error.code === 400)) throw error
      }
    }
    const language = await withPgClient(async (client) => {
      const {
        rows: [preferences],
      } = await client.query(
        "select language, detected_language from app_private.telegram_preferences where chat_id = $1",
        [chatId]
      )
      return resolveTelegramLanguage(preferences)
    })
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: reply ? telegramReplyText(reply, language) : text,
      ...(reply === "languageMenu" || reply === "languageSaved"
        ? { reply_markup: telegramLanguageKeyboard(language) }
        : {}),
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
  } catch (error) {
    if (error instanceof TelegramError && error.code === 403) return
    throw error
  }
}
export default task
