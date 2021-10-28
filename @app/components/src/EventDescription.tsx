import { memo } from "react"
import { arePropsEqual } from "@app/lib"
import { Badge, Descriptions } from "antd"
import dayjs from "dayjs"

import { H2, P, useTranslation } from "."

import type { EventPage_EventFragment } from "@app/graphql"

export type SignupState = {
  upcoming: boolean
  open: boolean
  closed: boolean
}

interface EventDescriptionProps {
  event: EventPage_EventFragment
  signupState: SignupState
}

function formatDate(val: string) {
  return dayjs(val).format("l LT")
}

export const EventDescription: React.FC<EventDescriptionProps> = memo(
  ({ event, signupState }) => {
    const { t, lang } = useTranslation("events")
    const {
      name,
      description,
      location,
      eventStartTime,
      eventEndTime,
      registrationStartTime,
      registrationEndTime,
    } = event

    const { upcoming, open, closed } = signupState

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
            {open && (
              <Badge color="green" text={t("common:registrationOpen")} />
            )}
            {upcoming && (
              <Badge color="yellow" text={t("common:registrationUpcoming")} />
            )}
            {closed && (
              <Badge color="red" text={t("common:registrationClosed")} />
            )}
          </Descriptions.Item>
        </Descriptions>

        <br />
        <P style={{ whiteSpace: "pre-line" }}>{description[lang]}</P>
      </>
    )
  },
  arePropsEqual
)
