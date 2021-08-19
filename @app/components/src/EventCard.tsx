import { Event } from "@app/graphql"
import { randomElementFromArray } from "@app/lib"
import { Badge, Card, Typography } from "antd"
import dayjs from "dayjs"
import Image from "next/image"
import useTranslation from "next-translate/useTranslation"

import { H5 } from "./Text"
import { ButtonLink, P } from "."

const { Text } = Typography
const { Ribbon } = Badge

const DEFAULT_HEADER_IMAGE =
  "https://static.prodeko.org/media/ilmo/default-header-image.jpg"

interface EventCardProps {
  event: Event
}

const rainbowColors = ["#d8353d", "#d8984f", "#1d8d4f", "#3877e4"]

const cardEventDatesStyle = {
  fontSize: 12,
  whiteSpace: "nowrap",
  paddingBottom: "0.5rem",
} as React.CSSProperties

export const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const {
    slug,
    name,
    location,
    description,
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
      // bodyStyle and style are used to position the signup button on the same row
      // even if the description of some event would be very short.
      bodyStyle={{ display: "flex", flexDirection: "column", flex: "1" }}
      cover={
        <Image
          alt={t("events:headerImage")}
          height={315}
          objectFit="cover"
          src={headerImageFile ?? DEFAULT_HEADER_IMAGE}
          width={851}
        />
      }
      style={{ display: "flex", flexDirection: "column" }}
    >
      <H5 ellipsis={true}>{title}</H5>
      <div style={cardEventDatesStyle}>
        <Text strong>{t("registrationTime")}:</Text>
        <br />
        {dayjs(registrationStartTime).format("LLL")}
        <br />
        {dayjs(registrationEndTime).format("LLL")}
      </div>
      <div style={cardEventDatesStyle}>
        <Text strong>{t("common:location")}: </Text>
        <span>{location}</span>
      </div>
      <P
        ellipsis={{
          rows: 2,
        }}
        style={{ fontSize: 12, height: "100%" }}
        type="secondary"
      >
        {description[lang]}
      </P>

      <ButtonLink
        data-cy={`eventcard-eventpage-link-${event.slug}`}
        href={`/event/${slug}`}
        size="middle"
        type={signupOpen ? "success" : "default"}
        block
      >
        {signupOpen ? t("registerToAnEvent") : t("common:moreInfo")}
      </ButtonLink>
    </Card>
  )

  return isHighlighted ? (
    <Ribbon
      color={randomElementFromArray(rainbowColors)}
      text={t("highlightText")}
    >
      {card}
    </Ribbon>
  ) : (
    card
  )
}
