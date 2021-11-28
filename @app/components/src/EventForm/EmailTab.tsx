import { memo, useState } from "react"
import { useRenderEmailTemplateQuery } from "@app/graphql"
import { arePropsEqual, getFormattedEventTime } from "@app/lib"
import { Card, Col, Row, Switch, Typography } from "antd"

import { useTranslation } from "../."

import { FormValues, getEventSlug } from "."

const { Text } = Typography

interface EmailTabProps {
  formValues: FormValues
}

export const EmailTab: React.FC<EmailTabProps> = memo(({ formValues }) => {
  const { t } = useTranslation("events")

  const [showHtml, setShowHtml] = useState(true)
  const [eventStart, eventEnd] = formValues?.eventTime || []
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
        eventTime: getFormattedEventTime(eventStart, eventEnd) || "",
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
}, arePropsEqual)
