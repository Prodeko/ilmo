// Server-only entry point: import this file directly, not through the browser barrel.
import { request } from "node:https"

export class TelegramError extends Error {
  constructor(
    public code: number,
    public retryAfter?: number
  ) {
    super(`Telegram request failed (${code})`)
  }
}

export function telegramRequest<T>(
  method: string,
  body: Record<string, unknown>,
  timeout = 35000
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return Promise.reject(new Error("Telegram bot is not configured"))
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token))
    return Promise.reject(new Error("Telegram bot token has an invalid format"))
  // Do not attach request objects, URLs, or Telegram response descriptions to
  // errors: the request path contains the bot token.
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = ""
        res.on("data", (chunk) => (data += chunk))
        res.on("error", () =>
          reject(new Error("Telegram response interrupted"))
        )
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data)
            if (parsed.ok) resolve(parsed.result as T)
            else
              reject(
                new TelegramError(
                  parsed.error_code || res.statusCode || 500,
                  parsed.parameters?.retry_after
                )
              )
          } catch {
            reject(new Error("Invalid Telegram response"))
          }
        })
      }
    )
    req.setTimeout(timeout, () => req.destroy())
    req.on("error", () => reject(new Error("Telegram connection failed")))
    req.end(payload)
  })
}

export type TelegramLanguage = "fi" | "en"
export type TelegramLanguagePreference = TelegramLanguage | "auto"

export function detectedTelegramLanguage(
  code?: string | null
): TelegramLanguage {
  return code?.toLowerCase().split("-")[0] === "fi" ? "fi" : "en"
}

export function resolveTelegramLanguage(preferences?: {
  language?: string | null
  detected_language?: string | null
}): TelegramLanguage {
  if (preferences?.language === "fi" || preferences?.language === "en")
    return preferences.language
  return detectedTelegramLanguage(preferences?.detected_language)
}

const telegramReplies = {
  en: {
    disconnected:
      "Telegram reminders disconnected. You can reconnect in Ilmo settings.",
    connected:
      "Telegram connected! Return to Ilmo to choose your reminders.\n\nChange language anytime with /language.",
    invalidLink:
      "This link is invalid or expired, or this Telegram account is already connected. Generate a new link in Ilmo settings.",
    welcome:
      "Connect your account using Connect Telegram in Ilmo settings. Use /stop to disconnect.\n\nChange language anytime with /language.",
    languageMenu:
      "Choose your bot language. Automatic follows your Telegram language (Finnish or English; other languages use English).",
    languageSaved:
      "Bot language saved. All Telegram messages, including scheduled reminders, now use this preference. Change it anytime with /language.",
    automatic: "Automatic",
  },
  fi: {
    disconnected:
      "Telegram-muistutukset poistettu käytöstä. Voit yhdistää tilin uudelleen Ilmon asetuksissa.",
    connected:
      "Telegram yhdistetty! Palaa Ilmoon valitsemaan muistutuksesi.\n\nChange language: /language.",
    invalidLink:
      "Linkki ei kelpaa, se on vanhentunut tai Telegram-tili on jo yhdistetty. Luo uusi linkki Ilmon asetuksissa.",
    welcome:
      "Yhdistä tilisi Ilmon asetusten Yhdistä Telegram -painikkeella. Komento /stop katkaisee yhteyden.\n\nChange language: /language.",
    languageMenu:
      "Valitse botin kieli. Automaattinen seuraa Telegramin kieltä (suomi tai englanti; muilla kielillä käytetään englantia).",
    languageSaved:
      "Botin kieliasetus tallennettu. Kaikki Telegram-viestit, myös ajastetut muistutukset, käyttävät nyt tätä asetusta. Change language: /language.",
    automatic: "Automaattinen",
  },
}
export type TelegramReply = Exclude<
  keyof typeof telegramReplies.en,
  "automatic"
>

export function telegramReplyText(
  reply: TelegramReply,
  language: TelegramLanguage
) {
  return telegramReplies[language][reply]
}

export function telegramLanguageKeyboard(language: TelegramLanguage) {
  return {
    inline_keyboard: [
      [
        { text: "English", callback_data: "language:en" },
        { text: "Suomi", callback_data: "language:fi" },
        {
          text: telegramReplies[language].automatic,
          callback_data: "language:auto",
        },
      ],
    ],
  }
}
