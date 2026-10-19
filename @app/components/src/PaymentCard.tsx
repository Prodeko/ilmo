import { PayPage_RegistrationPaymentFragment } from "@app/graphql"
import { formatEuro, PayPageState } from "@app/lib"
import { Alert, Button, Card, Space, Tag, theme, Typography } from "antd"
import dayjs from "dayjs"

import { useTranslation } from "./hooks"
import { Link, PaymentNote, PriceBreakdown } from "."

import type { CSSProperties, ReactNode } from "react"

/** Event time as on the pay page design: full year and an en dash. */
function formatEventTime(start: string, end: string) {
  const format = "D.M.YYYY HH:mm"
  return `${dayjs(start).format(format)} – ${dayjs(end).format(format)}`
}

const { Text, Title } = Typography

type CardState = Exclude<PayPageState, "disabled" | "notFound">

// Tag text key and antd preset colour for each state (boards 4 and 5)
const TAGS: Record<CardState, { key: string; color?: string }> = {
  unpaid: { key: "unpaid", color: "gold" },
  confirming: { key: "processing", color: "blue" },
  paid: { key: "paid", color: "green" },
  paidManually: { key: "paid", color: "green" },
  refunded: { key: "refunded" },
  queued: { key: "inQueue", color: "blue" },
  opensLater: { key: "notOpen", color: "blue" },
  free: { key: "free" },
}

const detailsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(80px, 140px) 1fr",
  rowGap: 8,
  columnGap: 12,
}

function translated(
  field: Record<string, string | null | undefined> | null | undefined,
  lang: string
): string {
  return field?.[lang] || field?.en || field?.fi || ""
}

interface PaymentCardProps {
  payment: PayPage_RegistrationPaymentFragment
  state: CardState
  // The status query parameter Stripe returned with
  returnStatus?: string | null
  onPay: () => void
  paying: boolean
  error?: ReactNode
}

/** The /pay page card (boards 4 and 5). */
export const PaymentCard: React.FC<PaymentCardProps> = ({
  payment,
  state,
  returnStatus,
  onPay,
  paying,
  error,
}) => {
  const { t, lang } = useTranslation("payments")
  const { token } = theme.useToken()
  const divider = `1px solid ${token.colorSplit}`
  const {
    eventSlug,
    eventName,
    eventStartTime,
    eventEndTime,
    registrationEndTime,
    quotaTitle,
    firstName,
    lastName,
    priceCents,
    serviceFeeCents,
    totalCents,
    paidTotalCents,
    paidAt,
    refundedAmountCents,
    refundedAt,
    queuePosition,
  } = payment
  const euro = (cents: number | null | undefined) =>
    formatEuro(cents ?? 0, lang)
  const date = (value: string | null | undefined) =>
    value ? dayjs(value).format("D.M.YYYY") : ""
  const time = (value: string | null | undefined) =>
    value ? dayjs(value).format("HH:mm") : ""

  const payable = state === "unpaid" || state === "confirming"
  const tag = TAGS[state]

  let body: ReactNode = null
  let detail: ReactNode = null
  switch (state) {
    case "paid":
      body = t("states.paid.body", {
        amount: euro(paidTotalCents),
        date: date(paidAt),
        time: time(paidAt),
      })
      detail = t("states.paid.detail")
      break
    case "paidManually":
      body = t("states.paidManually.body")
      break
    case "refunded": {
      const feeKept =
        paidTotalCents != null && (refundedAmountCents ?? 0) < paidTotalCents
      body = [
        t("states.refunded.body", {
          amount: euro(refundedAmountCents),
          date: date(refundedAt),
        }),
        feeKept
          ? t("states.refunded.feeNote", {
              fee: euro(paidTotalCents - (refundedAmountCents ?? 0)),
            })
          : null,
      ]
        .filter(Boolean)
        .join(" ")
      detail = t("states.refunded.detail")
      break
    }
    case "queued":
      body = t("states.queued.body", { position: queuePosition ?? "" })
      break
    case "opensLater":
      body = t("states.opensLater.body", {
        date: date(registrationEndTime),
        time: time(registrationEndTime),
      })
      break
    case "free":
      body = t("states.free.body")
      break
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {state === "unpaid" && returnStatus === "cancelled" && (
        <Alert
          data-cy="paypage-cancelled-notice"
          message={t("cancelledNotice")}
          type="warning"
        />
      )}
      {state === "unpaid" && returnStatus === "success" && (
        <Alert
          data-cy="paypage-confirm-timeout-notice"
          message={t("confirmTimeoutNotice")}
          type="info"
        />
      )}
      {state === "confirming" && (
        <Alert
          data-cy="paypage-confirming-notice"
          message={t("confirmingNotice")}
          type="info"
          showIcon
        />
      )}
      <Card data-cy="paypage-card" data-state={state}>
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Title level={3} style={{ margin: 0 }}>
              {payable ? t("title") : t(`states.${state}.title`)}
            </Title>
            <Tag
              color={tag.color}
              data-cy="paypage-status-tag"
              style={{ marginInlineEnd: 0 }}
            >
              {t(`tags.${tag.key}`)}
            </Tag>
          </div>
          <div style={detailsStyle}>
            <Text type="secondary">{t("event")}</Text>
            <span>
              <Link href={`/event/${eventSlug}`}>
                {translated(eventName, lang)}
              </Link>
            </span>
            <Text type="secondary">{t("time")}</Text>
            <span>{formatEventTime(eventStartTime, eventEndTime)}</span>
            {(firstName || lastName) && (
              <>
                <Text type="secondary">{t("name")}</Text>
                <span>{[firstName, lastName].filter(Boolean).join(" ")}</span>
              </>
            )}
            <Text type="secondary">{t("quota")}</Text>
            <span>{translated(quotaTitle, lang)}</span>
          </div>
          {payable ? (
            <>
              <div
                style={{
                  borderTop: divider,
                  paddingTop: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <PriceBreakdown
                  lang={lang}
                  priceCents={priceCents}
                  serviceFeeCents={serviceFeeCents}
                  serviceFeeLabel={t("serviceFee")}
                  ticketLabel={t("ticket")}
                  totalCents={totalCents}
                  totalLabel={t("total")}
                />
              </div>
              {error}
              {state === "unpaid" && (
                <Button
                  data-cy="paypage-button-pay"
                  loading={paying}
                  size="large"
                  type="primary"
                  block
                  onClick={onPay}
                >
                  {t("pay", { total: euro(totalCents) })}
                </Button>
              )}
            </>
          ) : (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Text data-cy="paypage-state-body">{body}</Text>
              {detail && (
                <div style={{ borderTop: divider, paddingTop: 12 }}>
                  <PaymentNote>{detail}</PaymentNote>
                </div>
              )}
            </Space>
          )}
        </Space>
      </Card>
    </Space>
  )
}
