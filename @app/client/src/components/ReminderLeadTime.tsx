import { useTranslation } from "@app/components"

export function ReminderLeadTime({ minutes }: { minutes: number }) {
  const { t } = useTranslation("reminders")
  return (
    <>
      {minutes === 1440
        ? t("leadTimes.day")
        : minutes === 60
          ? t("leadTimes.hour")
          : t("leadTime", { minutes })}
    </>
  )
}
