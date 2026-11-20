import { useEffect, useRef, useState } from "react"
import { useIsMobile, useTranslation } from "@app/components"
import { EventPage_EventFragment } from "@app/graphql"
import {
  calendarDescription,
  createCalendarLinks,
  createEventCalendar,
} from "@app/lib"
import { Button, message, notification, Space } from "antd"

import type { ArgsProps } from "antd/es/notification/interface"

const NOTIFICATION_KEY = "registration-calendar"
// Long enough to read the confirmation and reach the calendar options.
// Interacting with the toast keeps it open until the user closes it.
export const REGISTRATION_CALENDAR_DURATION_SECONDS = 12

export function RegistrationCalendar({
  event,
}: {
  event: EventPage_EventFragment
}) {
  const { t, lang } = useTranslation("register_event")
  const isMobile = useIsMobile()
  const [api, contextHolder] = notification.useNotification({
    placement: isMobile ? "top" : "topRight",
    maxCount: 1,
  })
  const [registrationId, setRegistrationId] = useState<string | null>(null)
  const eventRef = useRef(event)
  eventRef.current = event

  useEffect(() => {
    try {
      const key = `registered-event:${event.id}`
      const savedId = sessionStorage.getItem(key)
      if (savedId) {
        // Show the confirmation once; reloading the event page should not
        // bring it back.
        sessionStorage.removeItem(key)
        setRegistrationId(savedId)
      }
    } catch {
      // Browsers may disable storage. Registration itself still succeeds.
    }
  }, [event.id])

  useEffect(() => {
    if (!registrationId) return
    const event = eventRef.current
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
    const links = createCalendarLinks(calendarEvent)
    const downloadUrl = URL.createObjectURL(
      new Blob([createEventCalendar(calendarEvent)], {
        type: "text/calendar;charset=utf-8",
      })
    )
    const status = event.registrations.nodes.find(
      (registration) => registration.id === registrationId
    )?.status
    const emailMessage =
      status === "IN_QUOTA" || status === "IN_OPEN_QUOTA"
        ? "calendar.emailSent"
        : status === "IN_QUEUE"
          ? "calendar.waitlistEmailSent"
          : "calendar.emailConfirmation"

    let pinned = false
    const open = (duration: number) =>
      api.success({
        key: NOTIFICATION_KEY,
        message: t("eventSignupComplete"),
        description: content,
        duration,
        showProgress: duration > 0,
        pauseOnHover: true,
        role: "status",
        props: { "data-cy": "registration-calendar" } as ArgsProps["props"],
      })
    // Once the user starts using the calendar options (touch, click or
    // keyboard), keep the toast open so it does not vanish mid-action.
    const keepOpen = () => {
      if (pinned) return
      pinned = true
      open(0)
    }
    const content = (
      <div onFocusCapture={keepOpen} onPointerDownCapture={keepOpen}>
        <p style={{ marginBottom: 0 }}>{t(emailMessage)}</p>
        <details style={{ marginTop: 12 }}>
          <summary
            data-cy="registration-calendar-other"
            style={{ cursor: "pointer", fontWeight: 500 }}
          >
            {t("calendar.addAnother")}
          </summary>
          <Space direction="vertical" style={{ marginTop: 12, width: "100%" }}>
            <Button
              data-cy="registration-calendar-google"
              href={links.google}
              rel="noopener noreferrer"
              target="_blank"
              block
            >
              {t("calendar.google")}
            </Button>
            <Button
              data-cy="registration-calendar-microsoft365"
              href={links.microsoft365}
              rel="noopener noreferrer"
              target="_blank"
              block
            >
              Microsoft 365 / Outlook
            </Button>
            <Button
              data-cy="registration-calendar-outlook"
              href={links.outlook}
              rel="noopener noreferrer"
              target="_blank"
              block
            >
              Outlook.com
            </Button>
            <Button
              data-cy="registration-calendar-download"
              download={`${event.slug}.ics`}
              href={downloadUrl}
              block
            >
              {t("calendar.apple")}
            </Button>
          </Space>
        </details>
      </div>
    )

    // This toast replaces the brief signup message shown by the form.
    message.destroy("registration-signup-complete")
    open(REGISTRATION_CALENDAR_DURATION_SECONDS)
    return () => {
      api.destroy(NOTIFICATION_KEY)
      URL.revokeObjectURL(downloadUrl)
    }
  }, [api, lang, registrationId, t])

  return contextHolder
}
