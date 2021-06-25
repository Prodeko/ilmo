import React, { useCallback, useEffect, useState } from "react"
import { ApolloError } from "@apollo/client"
import {
  EventPageDocument,
  useClaimRegistrationTokenMutation,
  useCreateEventRegistrationMutation,
  useDeleteEventRegistrationMutation,
  useEventSlugByIdQuery,
  useUpdateEventRegistrationMutation,
} from "@app/graphql"
import {
  extractError,
  formItemLayout,
  getCodeFromError,
  tailFormItemLayout,
} from "@app/lib"
import * as Sentry from "@sentry/react"
import { Alert, Button, Form, Input, message, Popconfirm } from "antd"
import { Rule } from "antd/lib/form"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

interface EventRegistrationFormProps {
  type: "update" | "create"
  formRedirect: { pathname: string; query: { [key: string]: string } } | string
  // eventId and quotaId are used when type is "create"
  eventId?: string
  quotaId?: string
  // updateToken and initialValues are used when type is "update"
  updateToken?: string
  initialValues?: any
  setUpdateToken: React.Dispatch<React.SetStateAction<string>>
}

export const EventRegistrationForm: React.FC<EventRegistrationFormProps> = (
  props
) => {
  const {
    type,
    eventId,
    quotaId,
    updateToken,
    formRedirect,
    initialValues,
    setUpdateToken,
  } = props

  const { t } = useTranslation("register")
  const router = useRouter()

  // Get event slug for refetchQueries
  const { data: eventSlugByIdData } = useEventSlugByIdQuery({
    variables: { id: eventId },
  })

  // Handling form values, errors and submission
  const [form] = Form.useForm()
  const [formError, setFormError] = useState<Error | ApolloError | null>(null)
  const [createRegistration] = useCreateEventRegistrationMutation()
  const [deleteRegistration] = useDeleteEventRegistrationMutation()
  const [updateRegistration] = useUpdateEventRegistrationMutation()
  const [claimRegistratioToken] = useClaimRegistrationTokenMutation()
  const [deleting, setDeleting] = useState(false)
  const [registrationToken, setRegistrationToken] =
    useState<string | undefined>(undefined)

  const code = getCodeFromError(formError)

  useEffect(() => {
    // Set form initialValues if they have changed after the initial rendering
    form.setFieldsValue(initialValues)
  }, [form, initialValues])

  useEffect(() => {
    // Claim registration token on mount if related
    // event and quota exist
    ;(async () => {
      if (type === "create" && eventId && quotaId) {
        try {
          const { data } = await claimRegistratioToken({
            variables: { eventId, quotaId },
          })
          const { registrationToken, updateToken } =
            data?.claimRegistrationToken?.claimRegistrationTokenOutput || {}
          if (!registrationToken || !updateToken) {
            throw new Error(
              "Claiming the registration token failed, please reload the page."
            )
          }
          setRegistrationToken(registrationToken)
          setUpdateToken(updateToken)
        } catch (e) {
          setFormError(e)
          Sentry.captureException(e)
        }
      }
    })()
  }, [claimRegistratioToken, setUpdateToken, eventId, quotaId, type])

  const doDelete = useCallback(async () => {
    setFormError(null)
    setDeleting(true)
    try {
      if (updateToken) {
        // No need to update apollo cache manually with the delete mutation
        // since /event/[slug] page calls useEventRegistrations subscription
        // and gets the up-to-date list of registrations that way.
        const { data, errors } = await deleteRegistration({
          variables: { updateToken },
        })
        if (!data) {
          throw new Error("Result expected")
        }
        if (!data?.deleteRegistration?.success || errors) {
          throw new Error(t("deleteRegistrationFailed"))
        }
        router.push(formRedirect)
        message.success(t("registrationDeleteComplete"))
      }
    } catch (e) {
      setFormError(e)
      Sentry.captureException(e)
    }
    setDeleting(false)
  }, [deleteRegistration, updateToken, formRedirect, router, t])

  const handleSubmit = useCallback(
    async (values) => {
      setFormError(null)
      try {
        if (type === "create") {
          await createRegistration({
            variables: {
              ...values,
              eventId,
              quotaId,
              registrationToken,
            },
            // Refetch the event page query to get the up-to-date list of
            // registrations. Apollo can't manually update the results when new
            // records are added. Using refetchQueries is more efficient than
            // doing client.resetStore() which clears the entire cache. Even
            // more efficient solution would be to update the cache manually.
            // However, that turned out to be __very__ involved with our current
            // setup. This is due to the fact that we fetch event registrations
            // with subscriptions and normal queries.  Manual cache updating can
            // be done but it would result in many changes across seemingly
            // unrelated files thus increasing complexity.
            refetchQueries: [
              {
                query: EventPageDocument,
                variables: { slug: eventSlugByIdData?.event?.slug },
              },
            ],
          })
        } else if (type === "update") {
          await updateRegistration({
            variables: {
              ...values,
              updateToken,
            },
          })
        }

        router.push(formRedirect)
        type === "create"
          ? message.success(t("eventSignupComplete"))
          : message.success(t("registrationUpdateComplete"))
      } catch (e) {
        setFormError(e)
        Sentry.captureException(e)
      }
    },
    [
      createRegistration,
      updateRegistration,
      registrationToken,
      eventSlugByIdData,
      updateToken,
      formRedirect,
      router,
      eventId,
      quotaId,
      type,
      t,
    ]
  )

  const validateName: Rule = () => ({
    validator(_, value) {
      // firstName and lastName are not allowed to contain spaces
      if (/\s/.test(value)) {
        return Promise.reject(new Error(t("forms.rules.nameContainsSpace")))
      }
      return Promise.resolve()
    },
  })

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
          validateName,
        ]}
        hasFeedback
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
          validateName,
        ]}
        hasFeedback
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
          hasFeedback
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
        {type === "update" ? (
          <Popconfirm
            cancelText={t("common:no")}
            okText={t("common:yes")}
            placement="top"
            title={t("deleteRegistrationConfirmText")}
            onConfirm={doDelete}
          >
            <Button
              data-cy="eventregistrationform-button-delete-registration"
              loading={deleting}
              style={{ marginLeft: 5 }}
              danger
            >
              {t("deleteRegistration")}
            </Button>
          </Popconfirm>
        ) : null}
      </Form.Item>
    </Form>
  )
}
