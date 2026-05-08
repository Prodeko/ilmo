import {
  DEFAULT_HEADER_IMAGE,
  rainbowColors,
  randomElementFromArray,
} from "@app/lib"
import { Badge, Card, Typography } from "antd"
import dayjs from "dayjs"
import * as NextImage from "next/image"

import { H5 } from "./Text"
import { ButtonLink, EventQuotaPopover, Link, useTranslation } from "."

import type { Event } from "@app/graphql"

// See SharedLayout.tsx — namespace-then-default access works around a
// Next 16 webpack default-import bundling bug.
const Image = NextImage.default

const { Text } = Typography
const { Ribbon } = Badge

interface EventCardProps {
  event: Event
}

const cardInfoStyle = {
  fontSize: 12,
  whiteSpace: "nowrap",
  paddingBottom: "0.5rem",
} as React.CSSProperties

export const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const {
    slug,
    name,
    location,
    registrationStartTime,
    registrationEndTime,
    headerImageFile,
    signupOpen,
    isHighlighted,
  } = event
  const { t, lang } = useTranslation("home")

  const title = isHighlighted ? `🔥 ${name[lang]} 🔥 ` : name[lang]

  const card = (
    <Card
      // styles.body and style are used to position the signup button on the same row
      // even if the description of some event would be very short.
      cover={
        <Link href={`/event/${slug}`}>
          <div style={{ cursor: "pointer" }}>
            <Image
              alt={t("events:headerImage")}
              height={315}
              src={headerImageFile ?? DEFAULT_HEADER_IMAGE}
              style={{
                width: "100%",
                height: "auto",
                aspectRatio: "851 / 315",
                objectFit: "cover",
              }}
              width={851}
            />
          </div>
        </Link>
      }
      style={{ display: "flex", flexDirection: "column" }}
      styles={{
        body: { display: "flex", flexDirection: "column", flex: "1" },
      }}
    >
      <Link href={`/event/${slug}`}>
        <H5 style={{ cursor: "pointer" }} ellipsis>
          {title}
        </H5>
      </Link>
      <div style={cardInfoStyle}>
        <Text strong>{t("registrationTime")}:</Text>
        <br />
        {dayjs(registrationStartTime).format("LLL")}
        <br />
        {dayjs(registrationEndTime).format("LLL")}
      </div>
      <div style={cardInfoStyle}>
        <Text strong>{t("common:location")}: </Text>
        <span>{location}</span>
      </div>
      <div style={cardInfoStyle}>
        <EventQuotaPopover event={event} showText />
      </div>

      <ButtonLink
        data-cy={`eventcard-eventpage-link-${event.slug}`}
        href={`/event/${slug}`}
        size="middle"
        style={{ marginTop: "12px" }}
        type={signupOpen ? "primary" : "default"}
        block
      >
        {signupOpen ? t("registerToAnEvent") : t("common:moreInfo")}
      </ButtonLink>
    </Card>
  )

  return isHighlighted ? (
    <Ribbon
      color={randomElementFromArray(rainbowColors)}
      data-cy="eventcard-is-highlighted"
      text={t("highlightText")}
    >
      {card}
    </Ribbon>
  ) : (
    card
  )
}
