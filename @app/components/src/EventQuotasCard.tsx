import { memo } from "react"
import {
  EventPage_EventFragment,
  EventPage_RegistrationFragment,
  RegistrationStatus,
} from "@app/graphql"
import { arePropsEqual, formatEuro, quotaRequiresPayment } from "@app/lib"
import { Button, Card, Popover, Typography } from "antd"

import { useIsMobile, useTranslation } from "./hooks"
import { Link, ProgressBar, SignupState } from "."

interface EventQuotasCardProps {
  event: EventPage_EventFragment
  registrations: EventPage_RegistrationFragment[]
  signupState: SignupState
  // Query.paymentsEnabled. Prices are shown only when payments are on and
  // the event has a payment mode.
  paymentsEnabled?: boolean
}

export const EventQuotasCard: React.FC<EventQuotasCardProps> = memo(
  ({ event, registrations, signupState, paymentsEnabled }) => {
    const { t, lang } = useTranslation("events")
    const isMobile = useIsMobile()
    const { slug, quotas, paymentMode } = event
    const { upcoming, open, closed } = signupState
    const showPrices =
      !!paymentsEnabled && !!paymentMode && paymentMode !== "NONE"
    const hasPaidQuotas =
      showPrices &&
      !!quotas?.nodes.some((quota) =>
        quotaRequiresPayment(paymentsEnabled, paymentMode, quota.priceCents)
      )

    return (
      <Card
        data-cy="eventpage-quotas-card"
        size={!isMobile ? "default" : "small"}
        style={{
          marginLeft: !isMobile ? "1rem" : undefined,
          marginBottom: isMobile ? "1rem" : undefined,
          width: "100%",
        }}
        title={t("register_event:sidebar.title")}
        bordered
      >
        {quotas?.nodes.map((quota, i) => {
          const { id: quotaId, title, size, priceCents } = quota
          const totalCount = registrations.filter(
            (r) => r?.quota?.id === quotaId
          ).length
          const percentageFilled = Math.round((totalCount / size) * 100)
          // Shown on paid events (board 1), where the queue matters for who
          // pays; other events keep the plain "filled / size" label
          const queuedCount = showPrices
            ? registrations.filter(
                (r) =>
                  r?.quota?.id === quotaId &&
                  r?.status === RegistrationStatus.InQueue
              ).length
            : 0
          const signupNotOpen = upcoming || closed || !open
          const quotaButton = (
            <Button
              data-cy={`eventpage-quotas-link-${i}`}
              disabled={signupNotOpen}
              target="a"
              block
            >
              {showPrices ? (
                <span
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    width: "100%",
                  }}
                >
                  <span
                    style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {title[lang]}
                  </span>
                  <Typography.Text
                    data-cy={`eventpage-quotas-price-${i}`}
                    style={{
                      fontWeight: 600,
                      color: priceCents > 0 ? "inherit" : undefined,
                    }}
                    type={priceCents > 0 ? undefined : "success"}
                  >
                    {priceCents > 0 ? formatEuro(priceCents, lang) : t("free")}
                  </Typography.Text>
                </span>
              ) : (
                title[lang]
              )}
            </Button>
          )

          return (
            <div key={quotaId} style={{ paddingBottom: 12 }}>
              {signupNotOpen ? (
                <Popover content={t("eventSignupNotOpen")}>
                  {quotaButton}
                </Popover>
              ) : (
                <Link
                  href={{
                    pathname: "/event/[slug]/register/[quotaId]",
                    query: { slug, quotaId },
                  }}
                >
                  {quotaButton}
                </Link>
              )}
              <ProgressBar
                filled={totalCount}
                labelSuffix={
                  queuedCount > 0
                    ? ` · ${t("inQueueCount", { count: queuedCount })}`
                    : ""
                }
                percentageFilled={percentageFilled}
                size={size}
              />
            </div>
          )
        })}
        {hasPaidQuotas && (
          <Typography.Text
            data-cy="eventpage-quotas-payment-methods"
            style={{ display: "block", fontSize: 13 }}
            type="secondary"
          >
            {t("paymentMethods")}
          </Typography.Text>
        )}
      </Card>
    )
  },
  arePropsEqual
)
