import {
  resolveTelegramLanguage,
  TelegramError,
  telegramRequest,
} from "@app/lib/dist/cjs/telegram"

import sendEmail from "./send_email"

import type { Task } from "graphile-worker"

function telegramHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function formatOpeningTime(date: Date, language: "fi" | "en") {
  const timeZone = "Europe/Helsinki"
  const year = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
  }).format(date)
  const currentYear = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
  }).format(new Date())
  const parts = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: language === "fi" ? "numeric" : "short",
    ...(year !== currentYear ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  if (language === "fi") {
    const yearSuffix = year !== currentYear ? `.${year}` : ""
    const separator = year !== currentYear ? " klo " : ". klo "
    return `${value("weekday").replace(/\.$/, "")} ${value("day")}.${value("month")}${yearSuffix}${separator}${value("hour")}.${value("minute")}`
  }

  const yearSuffix = year !== currentYear ? ` ${year}` : ""
  return `${value("weekday")} ${value("day")} ${value("month")}${yearSuffix} at ${value("hour")}:${value("minute")}`
}

export function registrationReminderTask(channel: "email" | "telegram"): Task {
  return async (payload, { withPgClient }) => {
    const { id } = payload as { id: string }
    await withPgClient(async (client) => {
      await client.query("begin")
      try {
        // Serialize retries/cancellation for this reminder. Holding a shared event
        // lock keeps its opening time stable while deciding and sending.
        const {
          rows: [reminder],
        } = await client.query(
          `select r.*, e.name, e.slug, e.registration_start_time, e.is_draft,
          e.registration_start_time <= clock_timestamp() as already_open,
          e.registration_start_time - make_interval(mins => r.minutes_before) > clock_timestamp() as too_early,
          (select language from app_private.telegram_preferences p
            join app_public.telegram_accounts a on a.chat_id = p.chat_id where a.user_id = r.user_id) as bot_language,
          (select detected_language from app_private.telegram_preferences p
            join app_public.telegram_accounts a on a.chat_id = p.chat_id where a.user_id = r.user_id) as bot_detected_language,
          (select chat_id from app_public.telegram_accounts where user_id = r.user_id) as chat_id,
          (select email from app_public.user_emails
            where user_id = r.user_id and is_primary and is_verified) as email
         from app_public.event_registration_reminders r
         join app_public.events e on e.id = r.event_id
         where r.id = $1 for update of r for share of e`,
          [id]
        )
        if (
          !reminder ||
          reminder.sent_at ||
          reminder.is_draft ||
          reminder.already_open ||
          (channel === "email" &&
            (reminder.delivery_method === "telegram" ||
              reminder.email_sent_at ||
              !reminder.email)) ||
          (channel === "telegram" &&
            (reminder.delivery_method === "email" ||
              reminder.telegram_sent_at ||
              !reminder.chat_id))
        ) {
          await client.query("commit")
          return
        }
        if (reminder.too_early) {
          await client.query(
            "select app_private.schedule_registration_reminder($1)",
            [id]
          )
          await client.query("commit")
          return
        }
        const language =
          channel === "telegram"
            ? resolveTelegramLanguage({
                language: reminder.bot_language,
                detected_language: reminder.bot_detected_language,
              })
            : reminder.language === "en"
              ? "en"
              : "fi"
        const name =
          reminder.name[language] || reminder.name.fi || reminder.name.en || ""
        const openingTime = new Intl.DateTimeFormat(
          language === "fi" ? "fi-FI" : "en-GB",
          {
            timeZone: "Europe/Helsinki",
            dateStyle: "full",
            timeStyle: "short",
          }
        ).format(new Date(reminder.registration_start_time))
        const telegramOpeningTime = formatOpeningTime(
          new Date(reminder.registration_start_time),
          language
        )
        const rootUrl = process.env.ROOT_URL
        if (!rootUrl)
          throw new Error("ROOT_URL is required for registration reminders")
        const eventLanguage = reminder.name[language]
          ? language
          : reminder.name.fi
            ? "fi"
            : "en"
        const eventUrl = new URL(
          `/${eventLanguage}/event/${encodeURIComponent(reminder.slug)}`,
          rootUrl
        ).href
        if (channel === "email") {
          await sendEmail(
            {
              options: {
                to: reminder.email,
                subject:
                  language === "fi"
                    ? `${name} – ilmoittautuminen avautuu pian`
                    : `${name} – registration opens soon`,
              },
              template: "registration_reminder.mjml.njk",
              variables: { language, eventName: name, openingTime, eventUrl },
            },
            {} as any
          )
        } else {
          try {
            const text =
              language === "fi"
                ? `🔔 Ilmoittautumismuistutus\n\n<b>${telegramHtml(name)}</b>\n📅 Ilmoittautuminen alkaa ${telegramHtml(telegramOpeningTime)}.`
                : `🔔 Registration reminder\n\n<b>${telegramHtml(name)}</b>\n📅 Registration opens ${telegramHtml(telegramOpeningTime)}.`
            await telegramRequest("sendMessage", {
              chat_id: reminder.chat_id,
              parse_mode: "HTML",
              text,
              // Telegram rejects local/private URLs in inline buttons. A plain link
              // also makes the same reminder usable during local testing.
              ...(new URL(eventUrl).protocol === "https:"
                ? {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text:
                              language === "fi"
                                ? "Avaa tapahtuma"
                                : "Open event",
                            url: eventUrl,
                          },
                        ],
                      ],
                    },
                  }
                : {
                    text: `${text}\n\n🔗 ${telegramHtml(eventUrl)}`,
                  }),
            })
            // The shared Graphile queue serializes Telegram deliveries; stay below
            // Telegram's free broadcast limit even when many reminders become due.
            await new Promise((resolve) => setTimeout(resolve, 50))
          } catch (error) {
            if (error instanceof TelegramError && error.code === 403) {
              await client.query("select app_private.disconnect_telegram($1)", [
                reminder.user_id,
              ])
              await client.query("commit")
              return
            }
            if (error instanceof TelegramError && error.code === 429) {
              await client.query(
                "select graphile_worker.add_job('reminder__send_telegram', $1::json, run_at := clock_timestamp() + make_interval(secs => $2), job_key := $3, queue_name := 'telegram-reminders')",
                [
                  JSON.stringify({ id }),
                  error.retryAfter || 60,
                  `registration-reminder:${id}:telegram`,
                ]
              )
              await client.query("commit")
              return
            }
            throw error
          }
        }
        // Each channel commits its own checkpoint. Retrying the other channel
        // cannot resend a successfully recorded delivery.
        const column =
          channel === "email" ? "email_sent_at" : "telegram_sent_at"
        await client.query(
          `update app_public.event_registration_reminders set ${column} = clock_timestamp(),
          sent_at = case when delivery_method <> 'both' or ${channel === "email" ? "telegram_sent_at" : "email_sent_at"} is not null then clock_timestamp() else null end
          where id = $1`,
          [id]
        )
        await client.query("commit")
      } catch (error) {
        await client.query("rollback")
        throw error
      }
    })
  }
}

export default registrationReminderTask("email")
