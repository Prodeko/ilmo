import React from "react"
import {
  EventPage_EventFragment,
  EventPage_RegistrationsFragment,
} from "@app/graphql"
import { Button, Card, Popover } from "antd"
import useTranslation from "next-translate/useTranslation"

import { useIsMobile } from "./hooks"
import { Link, ProgressBar } from "."

interface EventQuotasCardProps {
  event: EventPage_EventFragment
  registrations: EventPage_RegistrationsFragment[]
}

export const EventQuotasCard: React.FC<EventQuotasCardProps> = ({
  event,
  registrations,
}) => {
  const { t, lang } = useTranslation("events")
  const isMobile = useIsMobile()
  const { id: eventId, signupClosed, signupUpcoming, quotas } = event

  return (
    <Card
      data-cy="eventpage-quotas-card"
      style={{
        marginLeft: !isMobile ? "1rem" : undefined,
        marginBottom: isMobile ? "1rem" : undefined,
        width: "100%",
      }}
      title={t("register:sidebar.title")}
      bordered
    >
      {quotas?.nodes.map((quota, i) => {
        const { id: quotaId, title, size } = quota
        const totalCount = registrations.filter(
          (r) => r?.quota?.id === quotaId
        ).length
        const percentageFilled = Math.round((totalCount / size) * 100)
        const signupNotOpen = signupClosed! || signupUpcoming!
        const quotaButton = (
          <Button
            data-cy={`eventpage-quotas-link-${i}`}
            disabled={signupNotOpen}
            target="a"
            block
          >
            {title[lang]}
          </Button>
        )

        return (
          <div key={quotaId} style={{ paddingBottom: 12 }}>
            <Link
              href={{
                pathname: "/event/register/[eventId]/q/[quotaId]",
                query: { eventId, quotaId },
              }}
            >
              {signupNotOpen ? (
                <Popover content={t("eventSignupNotOpen")}>
                  {quotaButton}
                </Popover>
              ) : (
                quotaButton
              )}
            </Link>
            <ProgressBar
              filled={totalCount}
              percentageFilled={percentageFilled}
              size={size}
            />
          </div>
        )
      })}
    </Card>
  )
}
