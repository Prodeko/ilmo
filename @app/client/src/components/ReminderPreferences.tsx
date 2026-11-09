import { useState } from "react"
import { ErrorAlert, Link, useTranslation } from "@app/components"
import { useSaveReminderPreferencesMutation } from "@app/graphql"
import { Alert, Button, Select, Space, Steps, Typography } from "antd"

import { ReminderLeadTime } from "./ReminderLeadTime"
import { TelegramConnection } from "./TelegramConnection"

type Preferences = { minutesBefore: number; deliveryMethod: string }

export function ReminderPreferences({
  preferences,
  account,
  botUsername,
  verified,
  refresh,
  onSaved,
}: {
  preferences?: Preferences | null
  account?: { username?: string | null } | null
  botUsername?: string | null
  verified: boolean
  refresh: () => void
  onSaved: () => Promise<void>
}) {
  const { t } = useTranslation("reminders")
  const [step, setStep] = useState(0)
  const [deliveryMethod, setDeliveryMethod] = useState(
    preferences?.deliveryMethod ?? (botUsername ? "telegram" : "email")
  )
  const [minutesBefore, setMinutesBefore] = useState(
    preferences?.minutesBefore ?? 30
  )
  const [mutation, save] = useSaveReminderPreferencesMutation()
  const [finishing, setFinishing] = useState(false)
  const needsTelegram = deliveryMethod !== "email"
  const needsEmail = deliveryMethod !== "telegram"
  const ready = (!needsTelegram || !!account) && (!needsEmail || verified)
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Paragraph>
        {t("preferences.explanation")}
      </Typography.Paragraph>
      <Steps
        current={step}
        items={[
          { title: t("preferences.delivery") },
          { title: t("preferences.timing") },
        ]}
        size="small"
      />
      {step === 0 ? (
        <>
          <label htmlFor="reminder-channel">{t("channelLabel")}</label>
          <Select
            data-cy="reminder-preferences-channel"
            id="reminder-channel"
            options={
              botUsername || needsTelegram
                ? [
                    {
                      value: "telegram",
                      label: (
                        <>
                          {t("channels.telegram")}{" "}
                          <Typography.Text
                            style={{ fontSize: 12 }}
                            type="secondary"
                          >
                            {t("recommended")}
                          </Typography.Text>
                        </>
                      ),
                    },
                    { value: "email", label: t("channels.email") },
                    { value: "both", label: t("channels.both") },
                  ]
                : [{ value: "email", label: t("channels.email") }]
            }
            style={{ width: "100%" }}
            value={deliveryMethod}
            onChange={setDeliveryMethod}
          />
          {needsTelegram &&
            (botUsername ? (
              <TelegramConnection
                account={account}
                botUsername={botUsername}
                refresh={refresh}
              />
            ) : (
              <Alert
                message={t("preferences.telegramUnavailable")}
                type="warning"
              />
            ))}
          {needsEmail && !verified && (
            <Link href="/settings/emails">{t("verifyEmail")}</Link>
          )}
          <Button
            data-cy="reminder-preferences-next"
            disabled={!ready || (needsTelegram && !botUsername)}
            type="primary"
            onClick={() => setStep(1)}
          >
            {t("preferences.next")}
          </Button>
        </>
      ) : (
        <>
          <label htmlFor="reminder-time">{t("minutesBefore")}</label>
          <Select<number>
            data-cy="reminder-preferences-time"
            id="reminder-time"
            options={[...new Set([5, 10, 15, 30, 60, 1440, minutesBefore])]
              .sort((a, b) => a - b)
              .map((minutes) => ({
                value: minutes,
                label: [5, 10, 15, 30, 60, 1440].includes(minutes)
                  ? t(`presets.${minutes}`)
                  : t("leadTime", { minutes }),
              }))}
            style={{ width: "100%" }}
            value={minutesBefore}
            onChange={setMinutesBefore}
          />
          <Typography.Text>
            {t(`channels.${deliveryMethod}`)} ·{" "}
            <ReminderLeadTime minutes={minutesBefore} />
          </Typography.Text>
          <Typography.Paragraph type="secondary">
            {t("timingNote")}
          </Typography.Paragraph>
          {mutation.error && <ErrorAlert error={mutation.error} />}
          <Space wrap>
            <Button disabled={finishing} onClick={() => setStep(0)}>
              {t("preferences.back")}
            </Button>
            <Button
              data-cy="reminder-preferences-save"
              disabled={!ready}
              loading={mutation.fetching || finishing}
              type="primary"
              onClick={async () => {
                setFinishing(true)
                try {
                  const result = await save({ minutesBefore, deliveryMethod })
                  if (!result.error) await onSaved()
                } finally {
                  setFinishing(false)
                }
              }}
            >
              {t("save")}
            </Button>
          </Space>
        </>
      )}
    </Space>
  )
}
