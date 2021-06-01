import React from "react"
import { EventPage_EventFragment } from "@app/graphql"
import { Badge, Descriptions } from "antd"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import { H2, P } from "."

interface EventDescriptionProps {
  event: EventPage_EventFragment
}

function formatDate(val: string) {
  return dayjs(val).format("l LT")
}
export const EventDescription: React.FC<EventDescriptionProps> = ({
  event,
}) => {
  const { t, lang } = useTranslation("events")
  const {
    name,
    description,
    location,
    signupOpen,
    signupUpcoming,
    signupClosed,
    eventStartTime,
    eventEndTime,
    registrationStartTime,
    registrationEndTime,
  } = event

  console.log(event)

  return (
    <>
      <H2>{name[lang]}</H2>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t("forms.eventTime")}>
          {formatDate(eventStartTime)} - {formatDate(eventEndTime)}
        </Descriptions.Item>
        <Descriptions.Item label={t("common:location")}>
          {location}
        </Descriptions.Item>
        <Descriptions.Item label={t("forms.registrationTime")}>
          {formatDate(registrationStartTime)} -{" "}
          {formatDate(registrationEndTime)}
        </Descriptions.Item>
        <Descriptions.Item label="">
          {signupOpen && (
            <Badge color="green" text={t("common:registrationOpen")} />
          )}
          {signupUpcoming && (
            <Badge color="yellow" text={t("common:registrationUpcoming")} />
          )}
          {signupClosed && (
            <Badge color="red" text={t("common:registrationClosed")} />
          )}
        </Descriptions.Item>
      </Descriptions>

      <br />
      <P>{description[lang]}</P>
    </>
  )
}
