import { useCallback, useEffect, useState } from "react"
import {
  useClaimRegistrationTokenMutation,
  useCreateEventRegistrationMutation,
  useDeleteEventRegistrationMutation,
  useUpdateEventRegistrationMutation,
} from "@app/graphql"
import * as Sentry from "@sentry/react"
import { Button, Form, Input, message, Popconfirm } from "antd"
import { Rule } from "antd/lib/form"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"
import { CombinedError } from "urql"

import { ErrorAlert } from "."

interface EventRegistrationFormProps {
  type: "update" | "create"
  formRedirect: { pathname: string; query: { [key: string]: string } } | string
  // eventId and quotaId are used when type is "create"
  eventId?: string
  quotaId?: string
  // updateToken and initialValues are used when type is "update"
  updateToken?: string
  initialValues?: any
  // Used to delete an unfinished registration
  setUpdateToken?: React.Dispatch<React.SetStateAction<string>>
}

// Use narrower form items for the registration form
const formItemLayout = {
  labelCol: {
    xs: { span: 24 },
    sm: { span: 6 },
  },
  wrapperCol: {
    xs: { span: 24 },
    sm: { span: 12 },
  },
}

const tailFormItemLayout = {
  wrapperCol: {
    xs: {
      span: 24,
      offset: 0,
    },
    sm: {
      span: 12,
      offset: 6,
    },
  },
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

  // Handling form values, errors and submission
  const [form] = Form.useForm()
  const [formError, setFormError] = useState<Error | CombinedError | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [registrationToken, setRegistrationToken] = useState<
    string | undefined
  >(undefined)
  const [_res1, createRegistration] = useCreateEventRegistrationMutation()
  const [_res2, deleteRegistration] = useDeleteEventRegistrationMutation()
  const [_res3, updateRegistration] = useUpdateEventRegistrationMutation()
  const [_res4, claimRegistratioToken] = useClaimRegistrationTokenMutation()

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
          const { data, error } = await claimRegistratioToken({
            eventId,
            quotaId,
          })
          if (error) throw error
          const { registrationToken, updateToken } =
            data?.claimRegistrationToken?.claimRegistrationTokenOutput || {}
          if (!registrationToken || !updateToken) {
            throw new Error(
              "Claiming the registration token failed, please reload the page."
            )
          }
          setRegistrationToken(registrationToken)
          setUpdateToken?.(updateToken)
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
        const { data, error } = await deleteRegistration({
          updateToken,
        })
        if (error) throw error
        if (!data?.deleteRegistration?.success || error) {
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
          const { error } = await createRegistration({
            ...values,
            eventId,
            quotaId,
            registrationToken,
          })
          if (error) throw error
        } else if (type === "update") {
          const { error } = await updateRegistration({
            ...values,
            updateToken,
          })
          if (error) throw error
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
          <ErrorAlert
            data-cy="eventregistrationform-error-alert"
            error={formError}
            message={
              type === "create"
                ? t("errors.registrationFailed")
                : t("errors.registrationUpdateFailed")
            }
          />
        </Form.Item>
      )}
      <Form.Item {...tailFormItemLayout}>
        <Button
          data-cy="eventregistrationform-button-submit"
          disabled={!!formError}
          htmlType="submit"
          loading={
            formError
              ? false
              : (type === "create" && !!registrationToken) || type === "update"
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
