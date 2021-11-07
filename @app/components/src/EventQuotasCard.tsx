import { memo } from "react"
import {
  EventPage_EventFragment,
  EventPage_RegistrationFragment,
} from "@app/graphql"
import { arePropsEqual } from "@app/lib"
import { Button, Card, Popover } from "antd"

import { useIsMobile, useTranslation } from "./hooks"
import { Link, ProgressBar, SignupState } from "."

interface EventQuotasCardProps {
  event: EventPage_EventFragment
  registrations: EventPage_RegistrationFragment[]
  signupState: SignupState
}

export const EventQuotasCard: React.FC<EventQuotasCardProps> = memo(
  ({ event, registrations, signupState }) => {
    const { t, lang } = useTranslation("events")
    const isMobile = useIsMobile()
    const { slug, quotas } = event
    const { upcoming, open, closed } = signupState

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
          const { id: quotaId, title, size } = quota
          const totalCount = registrations.filter(
            (r) => r?.quota?.id === quotaId
          ).length
          const percentageFilled = Math.round((totalCount / size) * 100)
          const signupNotOpen = upcoming || closed || !open
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
                percentageFilled={percentageFilled}
                size={size}
              />
            </div>
          )
        })}
      </Card>
    )
  },
  arePropsEqual
)
