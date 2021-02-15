import React, { useState } from "react";
import { ErrorAlert, SettingsLayout } from "@app/components";
import { useRenderEmailTemplatesQuery, useSharedQuery } from "@app/graphql";
import * as Sentry from "@sentry/react";
import { Card, Col, PageHeader, Row, Switch, Typography } from "antd";
import { capitalize } from "lodash";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";

const { Text } = Typography;

const Admin_Emails: NextPage = () => {
  const { t } = useTranslation("admin");
  const query = useSharedQuery();
  const [showHtml, setShowHtml] = useState(true);
  const { loading, data, error } = useRenderEmailTemplatesQuery();

  if (error) {
    Sentry.captureException(error);
  }

  return (
    <SettingsLayout href="/settings/accounts" query={query}>
      <PageHeader title="Emails" />

      {error ? (
        <ErrorAlert error={error} />
      ) : (
        <>
          <Switch
            defaultChecked
            onChange={(checked) => setShowHtml(checked)}
            loading={loading}
            style={{ marginRight: "1rem" }}
          />
          <Text>{t("common:emailSwitchLabel")}</Text>
          <Row style={{ marginTop: "1rem" }} gutter={16}>
            {data?.renderEmailTemplates.templates.map((email, i) => (
              <Col key={i} xs={{ span: 24 }} sm={{ span: 12 }}>
                <Card
                  title={capitalize(email?.name)}
                  style={{ margin: "10px" }}
                  loading={loading}
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
    </SettingsLayout>
  );
};

export default Admin_Emails;
