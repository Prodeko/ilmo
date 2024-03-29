import { useState } from "react"
import { AdminLayout, ErrorResult, useTranslation } from "@app/components"
import { useRenderEmailTemplatesQuery, useSharedQuery } from "@app/graphql"
import { Card, Col, PageHeader, Row, Switch, Typography } from "antd"
import capitalize from "lodash/capitalize"

import type { NextPage } from "next"

const { Text } = Typography

const Admin_Emails: NextPage = () => {
  const { t } = useTranslation("admin")
  const [query] = useSharedQuery()
  const [showHtml, setShowHtml] = useState(true)
  const [{ fetching, data, error }] = useRenderEmailTemplatesQuery()

  return (
    <AdminLayout href="/admin/emails" query={query}>
      <PageHeader title="Emails" />
      {error ? (
        <ErrorResult error={error} />
      ) : (
        <>
          <Switch
            loading={fetching}
            style={{ marginRight: "1rem" }}
            defaultChecked
            onChange={(checked) => setShowHtml(checked)}
          />
          <Text>{t("common:emailSwitchLabel")}</Text>
          <Row gutter={16} style={{ marginTop: "1rem" }}>
            {data?.renderEmailTemplates.templates.map((email, i) => (
              <Col key={i} sm={{ span: 12 }} xs={{ span: 24 }}>
                <Card
                  loading={fetching}
                  style={{ margin: "10px" }}
                  title={capitalize(email?.name)}
                >
                  {showHtml ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: email?.html,
                      }}
                    />
                  ) : (
                    <Text style={{ whiteSpace: "pre-wrap" }}>{email.text}</Text>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </>
      )}
    </AdminLayout>
  )
}

export default Admin_Emails
