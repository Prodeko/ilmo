import { useEffect, useState } from "react"
import { useTranslation } from "@app/components"
import { EventPage_EventFragment } from "@app/graphql"
import {
  calendarDescription,
  createCalendarLinks,
  createEventCalendar,
} from "@app/lib"
import { Alert, Button, Space } from "antd"

export function RegistrationCalendar({
  event,
}: {
  event: EventPage_EventFragment
}) {
  const { t, lang } = useTranslation("register_event")
  const [registered, setRegistered] = useState(false)
  const [registrationId, setRegistrationId] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string>()
  const [links, setLinks] = useState<ReturnType<typeof createCalendarLinks>>()

  useEffect(() => {
    try {
      const key = `registered-event:${event.id}`
      const savedId = sessionStorage.getItem(key)
      setRegistered(!!savedId)
      setRegistrationId(savedId)
    } catch {
      // Browsers may disable storage. Registration itself still succeeds.
    }
  }, [event.id])

  useEffect(() => {
    if (!registered) return
    const name = event.name[lang] || Object.values(event.name)[0] || ""
    const description =
      event.description[lang] || Object.values(event.description)[0]
    const calendarEvent = {
      id: event.id,
      name,
      location: event.location || "",
      description: calendarDescription(description),
      start: event.eventStartTime,
      end: event.eventEndTime,
      url: new URL(
        `/event/${encodeURIComponent(event.slug)}`,
        window.location.origin
      ).href,
    }
    const calendar = createEventCalendar(calendarEvent)
    setLinks(createCalendarLinks(calendarEvent))
    const url = URL.createObjectURL(
      new Blob([calendar], { type: "text/calendar;charset=utf-8" })
    )
    setDownloadUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [event, lang, registered])

  if (!registered) return null
  const status = event.registrations.nodes.find(
    (registration) => registration.id === registrationId
  )?.status
  const emailMessage =
    status === "IN_QUOTA" || status === "IN_OPEN_QUOTA"
      ? "calendar.emailSent"
      : status === "IN_QUEUE"
        ? "calendar.waitlistEmailSent"
        : "calendar.emailConfirmation"

  return (
    <Alert
      data-cy="registration-calendar"
      description={
        <>
          <p>{t(emailMessage)}</p>
          <details style={{ marginTop: 12 }}>
            <summary
              data-cy="registration-calendar-other"
              style={{ cursor: "pointer" }}
            >
              {t("calendar.addAnother")}
            </summary>
            <Space direction="vertical" style={{ marginTop: 12 }}>
              <Button
                data-cy="registration-calendar-google"
                disabled={!links}
                href={links?.google}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("calendar.google")}
              </Button>
              <Button
                data-cy="registration-calendar-microsoft365"
                disabled={!links}
                href={links?.microsoft365}
                rel="noopener noreferrer"
                target="_blank"
              >
                Microsoft 365 / Outlook
              </Button>
              <Button
                data-cy="registration-calendar-outlook"
                disabled={!links}
                href={links?.outlook}
                rel="noopener noreferrer"
                target="_blank"
              >
                Outlook.com
              </Button>
              <Button
                data-cy="registration-calendar-download"
                disabled={!downloadUrl}
                download={`${event.slug}.ics`}
                href={downloadUrl}
              >
                {t("calendar.apple")}
              </Button>
            </Space>
          </details>
        </>
      }
      message={t("eventSignupComplete")}
      style={{ marginBottom: 24 }}
      type="success"
      showIcon
    />
  )
}
