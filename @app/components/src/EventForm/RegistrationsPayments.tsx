import { useCallback, useState } from "react"
import {
  EventPaymentSummary,
  PaymentMode,
  RegistrationPaymentStatus,
  useAdminSendPaymentRemindersMutation,
} from "@app/graphql"
import { formatEuro } from "@app/lib"
import {
  Button,
  Card,
  Col,
  message,
  Modal,
  Row,
  Segmented,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"

import { ErrorAlert, useTranslation } from "../."

const { Text, Paragraph } = Typography

export type PaymentFilter = "all" | "unpaid" | "paid"

const STATUS_TAG_COLORS: Record<RegistrationPaymentStatus, string> = {
  [RegistrationPaymentStatus.Paid]: "success",
  [RegistrationPaymentStatus.PaidManually]: "success",
  [RegistrationPaymentStatus.Unpaid]: "warning",
  [RegistrationPaymentStatus.Refunded]: "default",
  [RegistrationPaymentStatus.NotRequired]: "default",
}

interface PaymentStatusTagProps {
  paymentStatus: RegistrationPaymentStatus | null | undefined
  queued: boolean
}

/** The Payment column of the registrations table (board 9). */
export const PaymentStatusTag: React.FC<PaymentStatusTagProps> = ({
  paymentStatus,
  queued,
}) => {
  const { t } = useTranslation("admin")
  // People in the queue don't pay until they get a spot, unless they have
  // somehow paid already.
  const isPaidOrRefunded =
    paymentStatus === RegistrationPaymentStatus.Paid ||
    paymentStatus === RegistrationPaymentStatus.PaidManually ||
    paymentStatus === RegistrationPaymentStatus.Refunded
  if (!paymentStatus || (queued && !isPaidOrRefunded)) {
    return <Text type="secondary">—</Text>
  }
  return (
    <Tag
      color={STATUS_TAG_COLORS[paymentStatus]}
      data-cy={`registrations-payment-status-${paymentStatus}`}
    >
      {t(`payments.status.${paymentStatus}`)}
    </Tag>
  )
}

interface PaymentSummaryProps {
  summary: EventPaymentSummary | null | undefined
}

/** Summary tiles above the registrations table (board 9). */
export const PaymentSummary: React.FC<PaymentSummaryProps> = ({ summary }) => {
  const { t } = useTranslation("admin")
  const tiles = [
    {
      key: "paid",
      title: t("payments.summary.paid"),
      value: String(summary?.paidCount ?? 0),
      suffix: t("payments.summary.paidOf", { count: summary?.dueCount ?? 0 }),
    },
    {
      key: "unpaid",
      title: t("payments.summary.unpaid"),
      value: String(summary?.unpaidCount ?? 0),
      valueStyle: summary?.unpaidCount ? { color: "#8a4b00" } : undefined,
    },
    {
      key: "ticketsPaid",
      title: t("payments.summary.ticketsPaid"),
      value: formatEuro(summary?.ticketsPaidCents ?? 0),
    },
    {
      key: "guildReceives",
      title: t("payments.summary.guildReceives"),
      value: `≈ ${formatEuro(summary?.guildReceivesCents ?? 0)}`,
    },
  ]

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      {tiles.map(({ key, title, value, suffix, valueStyle }) => (
        <Col key={key} lg={6} sm={12} xs={24}>
          <Card data-cy={`registrations-payment-summary-${key}`} size="small">
            <Statistic
              formatter={(v) => v}
              suffix={suffix}
              title={title}
              value={value}
              valueStyle={valueStyle}
            />
          </Card>
        </Col>
      ))}
    </Row>
  )
}

function formatReminderTime(value: string) {
  const date = dayjs(value)
  return { date: date.format("l"), time: date.format("LT") }
}

interface PaymentToolbarProps {
  eventId: string
  filter: PaymentFilter
  onFilterChange: (filter: PaymentFilter) => void
  summary: EventPaymentSummary | null | undefined
  totalCount: number
  paymentMode: PaymentMode
  lastReminderSentAt: string | null | undefined
  onRemindersSent: () => void
}

/**
 * The All / Unpaid / Paid filter and the "Send reminder to N unpaid" button
 * with its confirm dialog (boards 9 and 11).
 */
export const PaymentToolbar: React.FC<PaymentToolbarProps> = ({
  eventId,
  filter,
  onFilterChange,
  summary,
  totalCount,
  paymentMode,
  lastReminderSentAt,
  onRemindersSent,
}) => {
  const { t } = useTranslation("admin")
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [{ fetching }, sendReminders] = useAdminSendPaymentRemindersMutation()
  const unpaidCount = summary?.unpaidCount ?? 0

  const doSendReminders = useCallback(async () => {
    setError(null)
    try {
      const { data, error } = await sendReminders({ input: { eventId } })
      if (error) throw error
      const count = data?.adminSendPaymentReminders?.integer ?? 0
      message.success(t("payments.reminder.sent", { count }))
      setShowConfirm(false)
      onRemindersSent()
    } catch (e) {
      setError(e)
    }
  }, [eventId, sendReminders, onRemindersSent, t])

  return (
    <Row
      align="middle"
      gutter={[12, 12]}
      justify="space-between"
      style={{ marginBottom: 16 }}
    >
      <Col>
        <Segmented<PaymentFilter>
          data-cy="registrations-payment-filter"
          options={[
            {
              value: "all",
              label: t("payments.filter.all", { count: totalCount }),
            },
            {
              value: "unpaid",
              label: t("payments.filter.unpaid", { count: unpaidCount }),
            },
            {
              value: "paid",
              label: t("payments.filter.paid", {
                count: summary?.paidCount ?? 0,
              }),
            },
          ]}
          value={filter}
          onChange={onFilterChange}
        />
      </Col>
      {paymentMode !== PaymentMode.None && (
        <Col>
          <Space wrap>
            {lastReminderSentAt && (
              <Text data-cy="registrations-last-reminder" type="secondary">
                {t(
                  "payments.lastReminderSent",
                  formatReminderTime(lastReminderSentAt)
                )}
              </Text>
            )}
            <Button
              data-cy="registrations-button-send-reminders"
              disabled={unpaidCount === 0}
              type="primary"
              onClick={() => {
                setError(null)
                setShowConfirm(true)
              }}
            >
              {t("payments.sendReminder", { count: unpaidCount })}
            </Button>
          </Space>
        </Col>
      )}
      <Modal
        cancelText={t("payments.cancel")}
        confirmLoading={fetching}
        data-cy="registrations-modal-send-reminders"
        okText={t("payments.reminder.confirm", { count: unpaidCount })}
        open={showConfirm}
        title={t("payments.reminder.title", { count: unpaidCount })}
        destroyOnClose
        onCancel={() => setShowConfirm(false)}
        onOk={doSendReminders}
      >
        <Paragraph>{t("payments.reminder.body")}</Paragraph>
        {lastReminderSentAt && (
          <Paragraph type="secondary">
            {t(
              "payments.reminder.lastSent",
              formatReminderTime(lastReminderSentAt)
            )}
          </Paragraph>
        )}
        {error && (
          <ErrorAlert
            error={error}
            message={t("payments.reminder.failed")}
            setError={setError}
          />
        )}
      </Modal>
    </Row>
  )
}
