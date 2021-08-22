import { useState } from "react"
import { useRenderEmailTemplateQuery } from "@app/graphql"
import { Card, Col, Row, Switch, Typography } from "antd"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import { FormValues, getEventSlug } from "."

const { Text } = Typography

function getFormattedEventTime(dates?: Date[]) {
  const formatString = "D.M.YY HH:mm"
  const eventStartTime = dayjs(dates?.[0]).format(formatString)
  const eventEndTime = dayjs(dates?.[1]).format(formatString)
  return `${eventStartTime} - ${eventEndTime}`
}

interface EmailTabProps {
  formValues: FormValues
}

export const EmailTab: React.FC<EmailTabProps> = ({ formValues }) => {
  const { t } = useTranslation("events")

  const [showHtml, setShowHtml] = useState(true)
  const [{ fetching, data }] = useRenderEmailTemplateQuery({
    variables: {
      template: "event_registration.mjml.njk",
      variables: {
        registrationName: "{{ registrationName }}",
        registrationQuota: {
          fi: "{{ registrationQuota }}",
          en: "{{ registrationQuota }}",
        },
        eventName: formValues?.name,
        eventTime: getFormattedEventTime(formValues?.eventTime) || "",
        eventSlug: getEventSlug(formValues?.name, formValues?.eventTime),
        eventLocation: formValues?.location,
        eventRegistrationUpdateLink: "{{ eventRegistrationUpdateLink }}",
      },
    },
  })

  return (
    <Row>
      <Col span={24}>
        <Switch
          loading={fetching}
          style={{ margin: 10 }}
          defaultChecked
          onChange={(checked) => setShowHtml(checked)}
        />
        <Text>{t("common:emailSwitchLabel")}</Text>
        <Card loading={fetching} style={{ marginLeft: 10 }}>
          {showHtml ? (
            <div
              dangerouslySetInnerHTML={{
                __html: data?.renderEmailTemplate?.html!,
              }}
            />
          ) : (
            <Text style={{ whiteSpace: "pre-wrap" }}>
              {data?.renderEmailTemplate?.text}
            </Text>
          )}
        </Card>
      </Col>
    </Row>
  )
}
