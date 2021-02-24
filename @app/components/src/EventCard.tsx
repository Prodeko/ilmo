import React from "react";
import { Event } from "@app/graphql";
import { Card, Typography } from "antd";
import dayjs from "dayjs";
import useTranslation from "next-translate/useTranslation";

import { ButtonLink } from ".";

const { Meta } = Card;
const { Paragraph } = Typography;
interface EventCardProps {
  event: Event;
}

const cardEventDatesStyle = {
  fontSize: 12,
  whiteSpace: "nowrap",
  paddingBottom: "0.5rem",
} as React.CSSProperties;

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
  } = event;
  const { t, lang } = useTranslation("home");

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
              {t("home:events.registrationTime")}:
              <br />
              {dayjs(registrationStartTime).format("LLL")}
              <br />
              {dayjs(registrationEndTime).format("LLL")}
            </div>
            <Paragraph
              ellipsis={{
                rows: 2,
              }}
              style={{ fontSize: 12 }}
              type="secondary"
            >
              {description[lang]}
            </Paragraph>
            <ButtonLink
              href={`/event/${slug}`}
              size="middle"
              type={signupOpen ? "success" : "default"}
              block
            >
              {signupOpen
                ? t("events:registerToAnEvent")
                : t("common:moreInfo")}
            </ButtonLink>
          </>
        }
        title={name[lang]}
      />
    </Card>
  );
};
