import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApolloError, useApolloClient } from "@apollo/client";
import { Redirect, SharedLayout } from "@app/components";
import {
  CreatedRegistrationFragment,
  EventRegistrationPage_EventFragment,
  EventRegistrationPage_QuotaFragment,
  Registration,
  RegistrationToken,
  useClaimRegistrationTokenMutation,
  useCreateRegistrationMutation,
  useEventRegistrationPageQuery,
  useEventRegistrationsSubscription,
} from "@app/graphql";
import {
  extractError,
  formItemLayout,
  getCodeFromError,
  tailFormItemLayout,
} from "@app/lib";
import * as Sentry from "@sentry/react";
import {
  Alert,
  Button,
  Form,
  Input,
  List,
  message,
  PageHeader,
  Typography,
} from "antd";
import { NextPage } from "next";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

const EventRegistrationPage: NextPage = () => {
  const router = useRouter();
  const [error, setError] = useState<Error | ApolloError | null>(null);
  const { eventId, quotaId } = router.query;

  const [registrationToken, setRegistrationToken] = useState<
    RegistrationToken | any
  >(undefined);
  const query = useEventRegistrationPageQuery({
    variables: { eventId, quotaId },
  });
  const [
    claimRegistratioToken,
    { data: tokenData },
  ] = useClaimRegistrationTokenMutation();
  const loading = query.loading;
  const event = query?.data?.event;
  const quota = query?.data?.quota;

  useEffect(() => {
    // Claim registration token on mount if related
    // event and quota exist
    const claimToken = async () => {
      const { data, loading, error } = query;
      if (!loading && !error && data?.event && data?.quota) {
        try {
          await claimRegistratioToken({ variables: { eventId } });
        } catch (e) {
          setError(e);
          Sentry.captureException(e);
        }
      }
    };
    claimToken();
  }, [query, claimRegistratioToken, eventId]);

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
        error={error}
        setError={setError}
      />
    </SharedLayout>
  );
};

interface EventRegistrationPageInnerProps {
  event: EventRegistrationPage_EventFragment;
  quota: EventRegistrationPage_QuotaFragment;
  token: RegistrationToken;
  error: Error | ApolloError | null;
  setError: (error: Error | ApolloError | null) => void;
}

const EventRegisterPageinner: React.FC<EventRegistrationPageInnerProps> = ({
  event,
  quota,
  token,
  error,
  setError,
}) => {
  const { t, lang } = useTranslation("register");
  const client = useApolloClient();
  const [form] = Form.useForm();
  const [
    registration,
    setRegistration,
  ] = useState<null | CreatedRegistrationFragment>(null);
  const [createRegistration] = useCreateRegistrationMutation();

  // Subscribe to registrations created after this timestamp
  const after = useMemo(() => new Date().toISOString(), []);
  const [recentRegistrations, setRecentRegistrations] = useState<
    Registration[] | null | undefined
  >(undefined);
  useEventRegistrationsSubscription({
    variables: { eventId: event?.id, after },
    skip: !event?.id,
    onSubscriptionData: ({ subscriptionData }) =>
      setRecentRegistrations(
        subscriptionData?.data?.eventRegistrations
          ?.registrations as Registration[]
      ),
  });

  const handleSubmit = useCallback(
    async (values) => {
      setError(null);
      try {
        const { data } = await createRegistration({
          variables: {
            ...values,
            token,
            eventId: event.id,
            quotaId: quota.id,
          },
        });
        // Success: refetch
        client.resetStore();
        setRegistration(data?.createRegistration?.registration || null);
        message.success(t("eventSignupComplete"));
      } catch (e) {
        setError(e);
        Sentry.captureException(e);
      }
    },
    [client, createRegistration, event, quota, setError, token, t]
  );

  // If registration was completed successfully redirect to event page
  if (registration) {
    return <Redirect href="/event/[slug]" as={`/event/${event.slug}`} />;
  }

  const code = getCodeFromError(error);

  return (
    <>
      <PageHeader
        title={`${t("title")} ${event?.name[lang] || "loading..."} - ${
          quota?.title[lang] || "loading..."
        }`}
      />
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
          <Input data-cy="createregistration-input-email" />
        </Form.Item>
        {error ? (
          <Form.Item {...tailFormItemLayout}>
            <Alert
              data-cy="createregistration-error-alert"
              type="error"
              message={t("errors.registrationFailed")}
              description={
                <span>
                  {extractError(error).message}
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
            data-cy="createregistration-button-create"
            type="primary"
            loading={!!token || error ? false : true}
            disabled={error ? true : false}
            htmlType="submit"
          >
            {t("common:create")}
          </Button>
        </Form.Item>
      </Form>
      {recentRegistrations ? (
        <List
          header={<div>{t("recentlyRegisteredHeader")}</div>}
          bordered
          dataSource={recentRegistrations}
          renderItem={(item) => (
            <List.Item>
              <Typography.Text>
                {item?.fullName} {t("recentlyRegisteredListItem")}{" "}
                {item?.quota?.title[lang]}
              </Typography.Text>
            </List.Item>
          )}
        />
      ) : null}
    </>
  );
};

export default EventRegistrationPage;
