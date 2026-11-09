import { useEffect, useState } from "react"
import {
  ErrorAlert,
  Link,
  PageHeader,
  SettingsLayout,
  useTranslation,
} from "@app/components"
import {
  useRegistrationRemindersQuery,
  useSetEventRegistrationReminderMutation,
} from "@app/graphql"
import { Alert, Button, Empty, List, Modal, Space, Tag, Typography } from "antd"
import dayjs from "dayjs"

import { ReminderLeadTime } from "../../components/ReminderLeadTime"
import { ReminderPreferences } from "../../components/ReminderPreferences"
import { TelegramConnection } from "../../components/TelegramConnection"

export default function Reminders() {
  const { t, lang } = useTranslation("reminders")
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [first, setFirst] = useState(50)
  const [query, refresh] = useRegistrationRemindersQuery({
    variables: { first },
    requestPolicy: "cache-and-network",
  })
  useEffect(() => {
    const onFocus = () => refresh({ requestPolicy: "network-only" })
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refresh])
  const [mutation, setReminder] = useSetEventRegistrationReminderMutation()
  const reminders = query.data?.eventRegistrationReminders
  const language = lang === "en" ? "en" : "fi"
  return (
    <SettingsLayout href="/settings/reminders" query={query}>
      <PageHeader title={t("myReminders")} />
      {query.data && (
        <>
          <Typography.Title level={4}>
            {t("preferences.title")}
          </Typography.Title>
          <Typography.Paragraph>
            {t("preferences.explanation")}
          </Typography.Paragraph>
          {query.data.currentReminderPreferences && (
            <Typography.Paragraph>
              {t(
                `channels.${query.data.currentReminderPreferences.deliveryMethod}`
              )}{" "}
              ·{" "}
              <ReminderLeadTime
                minutes={query.data.currentReminderPreferences.minutesBefore}
              />
            </Typography.Paragraph>
          )}
          <Button
            data-cy="reminder-preferences-edit"
            style={{ marginBottom: 24 }}
            onClick={() => {
              setSaved(false)
              setEditing(true)
            }}
          >
            {t(
              query.data.currentReminderPreferences
                ? "preferences.changeSettings"
                : "preferences.getStarted"
            )}
          </Button>
          {saved && (
            <Alert
              message={t("preferences.saved")}
              style={{ marginBottom: 16 }}
              type="success"
            />
          )}
          <Modal
            footer={null}
            open={editing}
            title={t("preferences.title")}
            destroyOnClose
            onCancel={() => setEditing(false)}
          >
            {editing && (
              <ReminderPreferences
                account={query.data.currentTelegramAccount}
                botUsername={query.data.telegramBotUsername}
                preferences={query.data.currentReminderPreferences}
                refresh={() => refresh({ requestPolicy: "network-only" })}
                verified={
                  !!query.data.currentUser?.userEmails.nodes.some(
                    (email) => email.isPrimary && email.isVerified
                  )
                }
                onSaved={async () => {
                  setEditing(false)
                  setSaved(true)
                  refresh({ requestPolicy: "network-only" })
                }}
              />
            )}
          </Modal>
        </>
      )}
      <TelegramConnection
        account={query.data?.currentTelegramAccount}
        botUsername={query.data?.telegramBotUsername}
        refresh={() => refresh({ requestPolicy: "network-only" })}
      />
      <Typography.Paragraph>{t("timingNote")}</Typography.Paragraph>
      {query.error && <ErrorAlert error={query.error} />}
      {mutation.error && <ErrorAlert error={mutation.error} />}
      <List
        dataSource={reminders?.nodes || []}
        loading={query.fetching}
        locale={{ emptyText: <Empty description={t("empty")} /> }}
        renderItem={(reminder) => {
          const event = reminder.event
          const expired =
            event && dayjs(event.registrationStartTime).isBefore(dayjs())
          return (
            <List.Item
              actions={[
                <Button
                  key="cancel"
                  data-cy="reminder-cancel"
                  loading={mutation.fetching}
                  onClick={async () => {
                    const result = await setReminder({
                      eventId: reminder.eventId,
                      enabled: false,
                      language,
                    })
                    if (!result.error)
                      refresh({ requestPolicy: "network-only" })
                  }}
                >
                  {t("cancel")}
                </Button>,
              ]}
            >
              <Space direction="vertical">
                {event ? (
                  <Link href={`/event/${event.slug}`}>
                    {event.name[language] || event.name.fi || event.name.en}
                  </Link>
                ) : (
                  <span>{t("unavailable")}</span>
                )}
                {event && (
                  <span>
                    {t("opens")}:{" "}
                    {dayjs(event.registrationStartTime).format(
                      "D.M.YYYY HH:mm"
                    )}
                  </span>
                )}
                <span>
                  <ReminderLeadTime minutes={reminder.minutesBefore} />
                </span>
                <span>{t(`channels.${reminder.deliveryMethod}`)}</span>
                <Tag>
                  {t(
                    reminder.sentAt
                      ? "sent"
                      : !event || event.isDraft
                        ? "paused"
                        : expired
                          ? "expired"
                          : "pending"
                  )}
                </Tag>
              </Space>
            </List.Item>
          )
        }}
      />
      {reminders && reminders.totalCount > reminders.nodes.length && (
        <Button onClick={() => setFirst(first + 50)}>{t("loadMore")}</Button>
      )}
    </SettingsLayout>
  )
}
