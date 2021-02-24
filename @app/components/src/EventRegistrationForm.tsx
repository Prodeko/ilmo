import React, { useCallback, useEffect, useState } from "react";
import {
  ApolloError,
  DocumentNode,
  useApolloClient,
  useMutation,
} from "@apollo/client";
import {
  RegistrationToken,
  useClaimRegistrationTokenMutation,
} from "@app/graphql";
import {
  extractError,
  formItemLayout,
  getCodeFromError,
  tailFormItemLayout,
} from "@app/lib";
import * as Sentry from "@sentry/react";
import { Alert, Button, Form, Input, message } from "antd";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

interface EventRegistrationFormProps {
  type: "update" | "create";
  formRedirect: { pathname: string; query: { [key: string]: string } } | string;
  formMutationDocument: DocumentNode;
  // eventId, quotaId are only used when type is "create"
  eventId?: string;
  quotaId?: string;
  // registrationId, initialValues are only used when type is "update"
  registrationId?: string;
  initialValues?: any;
}

export const EventRegistrationForm: React.FC<EventRegistrationFormProps> = (
  props
) => {
  const {
    type,
    eventId,
    quotaId,
    registrationId,
    formRedirect,
    formMutationDocument,
    initialValues,
  } = props;

  const { t } = useTranslation("register");
  const client = useApolloClient();
  const router = useRouter();

  // Handling form values, errors and submission
  const [form] = Form.useForm();
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const [formQuery] = useMutation(formMutationDocument);
  const [claimRegistratioToken] = useClaimRegistrationTokenMutation();
  const [registrationToken, setRegistrationToken] = useState<
    RegistrationToken | undefined
  >(undefined);

  const code = getCodeFromError(formError);

  useEffect(() => {
    // Claim registration token on mount if related
    // event and quota exist
    const claimToken = async () => {
      // Only claim registration token when creating a registration
      if (type === "create" && eventId && quotaId) {
        try {
          const { data } = await claimRegistratioToken({
            variables: { eventId },
          });
          const token = data?.claimRegistrationToken?.registrationToken?.token;
          setRegistrationToken(token);
        } catch (e) {
          setFormError(e);
          Sentry.captureException(e);
        }
      }
    };
    claimToken();
  }, [claimRegistratioToken, eventId, quotaId, type]);

  const handleSubmit = useCallback(
    async (values) => {
      setFormError(null);
      try {
        // registrationToken, eventId and quotaId are used when type is "create"
        // registrationId is used when type is "update"
        await formQuery({
          variables: {
            ...values,
            registrationToken,
            eventId,
            quotaId,
            registrationId,
          },
        });
        // Success: refetch
        client.resetStore();
        router.push(formRedirect);
        type === "create"
          ? message.success(t("eventSignupComplete"))
          : message.success(t("registrationUpdateComplete"));
      } catch (e) {
        setFormError(e);
        Sentry.captureException(e);
      }
    },
    [
      formQuery,
      client,
      registrationId,
      t,
      registrationToken,
      formRedirect,
      router,
      eventId,
      quotaId,
      type,
    ]
  );

  return (
    <Form
      {...formItemLayout}
      form={form}
      initialValues={initialValues}
      onFinish={handleSubmit}
    >
      <Form.Item
        label={t("forms.firstName")}
        name="firstName"
        rules={[
          {
            required: true,
            message: t("forms.rules.provideFirstName"),
          },
        ]}
      >
        <Input data-cy="eventregistrationform-input-firstname" />
      </Form.Item>
      <Form.Item
        label={t("forms.lastName")}
        name="lastName"
        rules={[
          {
            required: true,
            message: t("forms.rules.provideLastName"),
          },
        ]}
      >
        <Input data-cy="eventregistrationform-input-lastname" />
      </Form.Item>
      {type == "create" && (
        <Form.Item
          label={t("forms.email")}
          name="email"
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
          <Input data-cy="eventregistrationform-input-email" />
        </Form.Item>
      )}
      {formError && (
        <Form.Item {...tailFormItemLayout}>
          <Alert
            data-cy="eventregistrationform-error-alert"
            description={
              <span>
                {extractError(formError).message}{" "}
                {code && (
                  <span>
                    ({t("error:errorCode")}: <code>ERR_{code}</code>)
                  </span>
                )}
              </span>
            }
            message={
              type === "create"
                ? t("errors.registrationFailed")
                : t("errors.registrationUpdateFailed")
            }
            type="error"
          />
        </Form.Item>
      )}
      <Form.Item {...tailFormItemLayout}>
        <Button
          data-cy="eventregistrationform-button-submit"
          htmlType="submit"
          loading={
            (type === "create" && !!registrationToken) || type === "update"
              ? false
              : true
          }
          type="primary"
        >
          {t(`common:${type}`)}
        </Button>
      </Form.Item>
    </Form>
  );
};
