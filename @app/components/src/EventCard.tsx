import React from "react"
import { Event } from "@app/graphql"
import { Card } from "antd"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import { ButtonLink, P } from "."

const { Meta } = Card
interface EventCardProps {
  event: Event
}

const cardEventDatesStyle = {
  fontSize: 12,
  whiteSpace: "nowrap",
  paddingBottom: "0.5rem",
} as React.CSSProperties

const highlightedStyle = {
  // Prodeko rainbow colors
  background:
    "linear-gradient(-45deg, #90000c, #e83d09, #fbe867, #005244, #16288c)",
  backgroundSize: "400% 400%",
  animation: "gradient 10s ease infinite",
  border: "none",
} as React.CSSProperties

export const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const {
    id,
    slug,
    name,
    description,
    registrationStartTime,
    registrationEndTime,
    headerImageFile,
    signupOpen,
    isHighlighted,
  } = event
  const { t, lang } = useTranslation("home")

  return (
    <Card
      key={id}
      cover={
        headerImageFile ? (
          <img alt={t("events:headerImage")} src={headerImageFile} />
        ) : null
      }
      style={{ overflow: "hidden", minWidth: 0 }}
    >
      <Meta
        description={
          <>
            <div style={cardEventDatesStyle}>
              {t("events.registrationTime")}:
              <br />
              {dayjs(registrationStartTime).format("LLL")}
              <br />
              {dayjs(registrationEndTime).format("LLL")}
            </div>
            <P
              ellipsis={{
                rows: 2,
              }}
              style={{ fontSize: 12 }}
              type="secondary"
            >
              {description[lang]}
            </P>
            <ButtonLink
              data-cy={`eventcard-eventpage-link-${event.slug}`}
              href={`/event/${slug}`}
              size="middle"
              style={isHighlighted ? highlightedStyle : undefined}
              type={signupOpen ? "success" : "default"}
              block
            >
              {signupOpen
                ? t("events.registerToAnEvent")
                : t("common:moreInfo")}
            </ButtonLink>
          </>
        }
        title={name[lang]}
      />
    </Card>
  )
}
