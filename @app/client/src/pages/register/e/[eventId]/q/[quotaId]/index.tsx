import React, { useCallback, useEffect, useState } from "react";
import { ApolloError } from "@apollo/client";
import { Redirect, SharedLayout } from "@app/components";
import {
  CreatedRegistrationFragment,
  EventRegistrationPage_EventFragment,
  EventRegistrationPage_QuotaFragment,
  RegistrationToken,
  useClaimRegistrationTokenMutation,
  useCreateRegistrationMutation,
  useEventRegistrationPageQuery,
} from "@app/graphql";
import {
  extractError,
  formItemLayout,
  getCodeFromError,
  tailFormItemLayout,
} from "@app/lib";
import { Alert, Button, Col, Form, Input, PageHeader, Row } from "antd";
import { NextPage } from "next";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

const EventRegistrationPage: NextPage = () => {
  const router = useRouter();
  const { eventId, quotaId } = router.query;

  const [registrationToken, setRegistrationToken] = useState<
    RegistrationToken | any
  >(undefined);
  const query = useEventRegistrationPageQuery({
    variables: { eventId, quotaId },
  });
  const [claimToken, { data: tokenData }] = useClaimRegistrationTokenMutation();
  const loading = query.loading;
  const event = query?.data?.event;
  const quota = query?.data?.quota;

  useEffect(() => {
    // Claim registration token on mount if related
    // event and quota exist
    const { data, loading, error } = query;
    if (!loading && !error && data?.event && data?.quota) {
      claimToken({ variables: { eventId } });
    }
  }, [claimToken, eventId, query]);

  useEffect(() => {
    // Store registration token when claimRegistrationTokenMutation finishes
    const token = tokenData?.claimRegistrationToken?.registrationToken?.token;
    if (token) {
      setRegistrationToken(token);
    }
  }, [tokenData]);

  // If event or quota don't exist redirect to index
  if ((!loading && !event) || (!loading && !quota)) {
    return <Redirect layout href="/" />;
  }

  return (
    <SharedLayout title="" query={query}>
      <EventRegisterPageinner
        event={event!}
        quota={quota!}
        token={registrationToken}
      />
    </SharedLayout>
  );
};

interface EventRegistrationPageInnerProps {
  event: EventRegistrationPage_EventFragment;
  quota: EventRegistrationPage_QuotaFragment;
  token: RegistrationToken;
}

const EventRegisterPageinner: React.FC<EventRegistrationPageInnerProps> = ({
  event,
  quota,
  token,
}) => {
  const { t } = useTranslation("register");
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const [form] = Form.useForm();

  const code = getCodeFromError(formError);
  const [
    registration,
    setRegistration,
  ] = useState<null | CreatedRegistrationFragment>(null);
  const [createRegistration] = useCreateRegistrationMutation();

  const handleSubmit = useCallback(
    async (values) => {
      setFormError(null);
      try {
        // TODO: Remove rate limit key from redis on successful registration
        const { data } = await createRegistration({
          variables: {
            ...values,
            token,
            eventId: event.id,
            quotaId: quota.id,
          },
        });
        setFormError(null);
        setRegistration(data?.createRegistration?.registration || null);
      } catch (e) {
        setFormError(e);
      }
    },
    [createRegistration, event, quota, token]
  );

  // If registration was completed successfully redirect to event page
  if (registration) {
    return <Redirect href="/event/[slug]" as={`/event/${event.slug}`} />;
  }

  return (
    <Row>
      <Col flex={1}>
        <PageHeader
          title={`${t("title")} ${event?.name || "loading..."} - ${
            quota?.title || "loading..."
          }`}
        />
        <div>
          <Form {...formItemLayout} form={form} onFinish={handleSubmit}>
            <Form.Item
              name="firstName"
              label={t("forms.firstName")}
              rules={[
                {
                  required: true,
                  message: t("forms.rules.provideFirstName"),
                },
              ]}
            >
              <Input data-cy="createregistration-input-firstname" />
            </Form.Item>
            <Form.Item
              name="lastName"
              label={t("forms.lastName")}
              rules={[
                {
                  required: true,
                  message: t("forms.rules.provideLastName"),
                },
              ]}
            >
              <Input data-cy="createregistration-input-lastname" />
            </Form.Item>
            <Form.Item
              name="email"
              label={t("forms.email")}
              rules={[
                {
                  type: "email",
                  message: t("forms.rules.emailValid"),
                },
                {
                  required: true,
                  message: t("forms.rules.emailEmpty"),
                },
              ]}
            >
              <Input data-cy="registerpage-input-email" />
            </Form.Item>
            {formError ? (
              <Form.Item {...tailFormItemLayout}>
                <Alert
                  type="error"
                  message={t("errors.registrationFailed")}
                  description={
                    <span>
                      {extractError(formError).message}
                      {code ? (
                        <span>
                          {" "}
                          ({t("error:errorCode")}: <code>ERR_{code}</code>)
                        </span>
                      ) : null}
                    </span>
                  }
                />
              </Form.Item>
            ) : null}
            <Form.Item {...tailFormItemLayout}>
              <Button
                type="primary"
                loading={!!token ? false : true}
                htmlType="submit"
                data-cy="createregistration-button-create"
              >
                {t("common:create")}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Col>
    </Row>
  );
};

export default EventRegistrationPage;
