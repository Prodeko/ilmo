import { useEffect, useState } from "react"
import { BellOutlined, CheckCircleFilled } from "@ant-design/icons"
import {
  ButtonLink,
  ErrorAlert,
  Link,
  useIsMobile,
  useTranslation,
} from "@app/components"
import {
  SharedLayout_UserFragment,
  useEnableEventReminderMutation,
  useEventRegistrationReminderQuery,
  useSetEventRegistrationReminderMutation,
} from "@app/graphql"
import { Button, Modal, notification, theme, Typography } from "antd"

import { ReminderLeadTime } from "./ReminderLeadTime"
import { ReminderPreferences } from "./ReminderPreferences"

import type { ArgsProps } from "antd/es/notification/interface"

const NOTIFICATION_KEY = "event-reminder-set"
export const REMINDER_SET_DURATION_SECONDS = 8

// Full-width like the quota buttons above, so "Set reminder" and "Remove
// reminder" occupy exactly the same spot.
const buttonStyle: React.CSSProperties = { marginTop: 12 }

// One fixed layout for every state: a status line and a full-width button.
// Delivery details are shown in the confirmation toast and in settings.
function ReminderPanel({
  icon,
  title,
  action,
  error,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  action: React.ReactNode
  error?: React.ReactNode
}) {
  const { token } = theme.useToken()
  return (
    <div
      data-cy="event-reminder"
      style={{
        background: token.colorInfoBg,
        border: `1px solid ${token.colorInfoBorder}`,
        borderRadius: token.borderRadiusLG,
        padding: "12px 16px",
      }}
    >
      <Typography.Text data-cy="event-reminder-status" strong>
        {icon} {title}
      </Typography.Text>
      {action}
      {error && <div style={{ marginTop: 12 }}>{error}</div>}
    </div>
  )
}

export function EventReminder({
  eventId,
  slug,
  currentUser,
}: {
  eventId: string
  slug: string
  currentUser: SharedLayout_UserFragment | null | undefined
}) {
  const { t, lang } = useTranslation("reminders")
  const isMobile = useIsMobile()
  const { token } = theme.useToken()
  const [api, contextHolder] = notification.useNotification({
    placement: isMobile ? "top" : "topRight",
  })
  const [setup, setSetup] = useState(false)
  // Set after enabling succeeds; the toast opens once the refreshed reminder
  // (with its actual delivery method and lead time) has loaded.
  const [confirmPending, setConfirmPending] = useState(false)
  const [query, refresh] = useEventRegistrationReminderQuery({
    variables: { eventId },
    pause: !currentUser,
    requestPolicy: "cache-and-network",
  })
  const [mutation, setReminder] = useSetEventRegistrationReminderMutation()
  const [enableMutation, enable] = useEnableEventReminderMutation()
  const reminder = query.data?.eventRegistrationReminders?.nodes[0]
  const preferences = query.data?.currentReminderPreferences
  const refreshData = () => refresh({ requestPolicy: "network-only" })
  useEffect(() => {
    const onFocus = () => {
      if (currentUser) refresh({ requestPolicy: "network-only" })
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refresh, currentUser])

  useEffect(() => {
    if (!confirmPending) return
    if (query.error) setConfirmPending(false)
    if (!reminder) return
    setConfirmPending(false)
    api.success({
      key: NOTIFICATION_KEY,
      message: t("toast.title"),
      description: (
        <>
          <div>
            {t("toast.delivery")}: {t(`channels.${reminder.deliveryMethod}`)}
          </div>
          <div>
            {t("toast.timing")}:{" "}
            <ReminderLeadTime minutes={reminder.minutesBefore} />
          </div>
        </>
      ),
      actions: (
        <Link
          data-cy="event-reminder-toast-settings"
          href="/settings/reminders"
        >
          {t("preferences.changeSettings")}
        </Link>
      ),
      duration: REMINDER_SET_DURATION_SECONDS,
      showProgress: true,
      pauseOnHover: true,
      role: "status",
      props: { "data-cy": "event-reminder-toast" } as ArgsProps["props"],
    })
  }, [api, confirmPending, query.error, reminder, t])

  // Close the toast when leaving the event page.
  useEffect(() => () => api.destroy(NOTIFICATION_KEY), [api])

  if (!currentUser)
    return (
      <ReminderPanel
        action={
          <ButtonLink
            data-cy="event-reminder-sign-in"
            href={`/login?next=${encodeURIComponent(`/event/${slug}`)}`}
            icon={<BellOutlined />}
            style={buttonStyle}
            block
          >
            {t("signIn")}
          </ButtonLink>
        }
        icon={<BellOutlined style={{ color: token.colorPrimary }} />}
        title={t("preferences.eventPrompt")}
      />
    )
  const verified = (
    query.data?.currentUser ?? currentUser
  ).userEmails.nodes.some((email) => email.isPrimary && email.isVerified)
  const needsSetup =
    !preferences ||
    (preferences.deliveryMethod !== "email" &&
      (!query.data?.currentTelegramAccount ||
        !query.data?.telegramBotUsername)) ||
    (preferences.deliveryMethod !== "telegram" && !verified)
  const enableReminder = async () => {
    const result = await enable({
      eventId,
      language: lang === "en" ? "en" : "fi",
    })
    if (!result.error) {
      setSetup(false)
      setConfirmPending(true)
      refreshData()
    }
  }
  const cancelReminder = async () => {
    const result = await setReminder({
      eventId,
      enabled: false,
      language: lang === "en" ? "en" : "fi",
    })
    if (!result.error) {
      api.destroy(NOTIFICATION_KEY)
      refreshData()
    }
  }
  const error = query.error || mutation.error || enableMutation.error
  return (
    <>
      {contextHolder}
      <ReminderPanel
        action={
          reminder ? (
            <Button
              data-cy="event-reminder-toggle"
              disabled={query.fetching || !!query.error}
              loading={mutation.fetching}
              style={buttonStyle}
              block
              onClick={cancelReminder}
            >
              {t("cancel")}
            </Button>
          ) : (
            <Button
              data-cy="event-reminder-toggle"
              disabled={query.fetching || !!query.error}
              icon={<BellOutlined />}
              loading={enableMutation.fetching || confirmPending}
              style={buttonStyle}
              type="primary"
              block
              onClick={async () => {
                if (needsSetup) setSetup(true)
                else await enableReminder()
              }}
            >
              {t("enable")}
            </Button>
          )
        }
        error={error && <ErrorAlert error={error} />}
        icon={
          reminder ? (
            <CheckCircleFilled style={{ color: token.colorSuccess }} />
          ) : (
            <BellOutlined style={{ color: token.colorPrimary }} />
          )
        }
        title={
          reminder
            ? t(reminder.sentAt ? "sent" : "enabled")
            : t("preferences.eventPrompt")
        }
      />
      <Modal
        footer={null}
        open={setup}
        title={t("preferences.title")}
        destroyOnClose
        onCancel={() => setSetup(false)}
      >
        {setup && (
          <ReminderPreferences
            account={query.data?.currentTelegramAccount}
            botUsername={query.data?.telegramBotUsername}
            preferences={preferences}
            refresh={refreshData}
            verified={verified}
            onSaved={enableReminder}
          />
        )}
        {enableMutation.error && <ErrorAlert error={enableMutation.error} />}
      </Modal>
    </>
  )
}
