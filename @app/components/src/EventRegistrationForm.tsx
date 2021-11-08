import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  CreateEventRegistrationDocument,
  EventPage_QuestionFragment,
  QuestionType,
  UpdateEventRegistrationDocument,
  useClaimRegistrationTokenMutation,
  useDeleteEventRegistrationMutation,
} from "@app/graphql"
import {
  arePropsEqual,
  registrationFormItemLayout,
  tailFormItemLayout,
} from "@app/lib"
import {
  Button,
  Checkbox,
  Form,
  Input,
  message,
  Popconfirm,
  Radio,
  Space,
  Typography,
} from "antd"
import { useRouter } from "next/router"
import { CombinedError, useMutation } from "urql"

import { ErrorAlert, useTranslation } from "."

import type { Rule } from "antd/lib/form"

const { Text } = Typography

interface EventRegistrationFormProps {
  type: "update" | "create"
  isAdmin?: boolean
  questions: EventPage_QuestionFragment[]
  formRedirect?: { pathname: string; query: { [key: string]: string } } | string
  // SubmitAction is used when this form is displayed in the admin panel
  submitAction?: () => void
  // eventId and quotaId are used when type is "create"
  eventId?: string
  quotaId?: string
  // updateToken and initialValues are used when type is "update"
  updateToken?: string
  initialValues?: any
  // Used to delete an unfinished registration
  setUpdateToken?: React.Dispatch<React.SetStateAction<string>>
}

// important React.memo, otherwise the form fields may be cleared as
// RecentRegistrationsList is rendered
export const EventRegistrationForm: React.FC<EventRegistrationFormProps> = memo(
  (props) => {
    const {
      type,
      isAdmin,
      eventId,
      quotaId,
      questions,
      updateToken,
      formRedirect,
      submitAction,
      initialValues,
      setUpdateToken,
    } = props

    const { t, lang } = useTranslation("register_event")
    const router = useRouter()

    // Handling form values, errors and submission
    const [form] = Form.useForm()
    const [formError, setFormError] = useState<Error | CombinedError | null>(
      null
    )
    const [deleting, setDeleting] = useState(false)
    const [registrationToken, setRegistrationToken] = useState<
      string | undefined
    >(undefined)

    // Mutations
    const mutation =
      type === "update"
        ? UpdateEventRegistrationDocument
        : CreateEventRegistrationDocument
    const [, formMutation] = useMutation(mutation)
    const [, deleteRegistration] = useDeleteEventRegistrationMutation()
    const [, claimRegistrationToken] = useClaimRegistrationTokenMutation()

    useEffect(() => {
      form.setFieldsValue(initialValues)
    }, [form, initialValues])

    useEffect(() => {
      // Claim registration token on mount if related
      // event and quota exist
      ;(async () => {
        if (type === "create" && eventId && quotaId) {
          try {
            const { data, error } = await claimRegistrationToken({
              input: {
                eventId,
                quotaId,
              },
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
          }
        }
      })()
    }, [claimRegistrationToken, setUpdateToken, eventId, quotaId, type])

    const doDelete = useCallback(async () => {
      setFormError(null)
      setDeleting(true)
      try {
        if (updateToken) {
          const { data, error } = await deleteRegistration({
            updateToken,
          })
          if (error) throw error
          if (!data?.deleteRegistration?.success) {
            throw new Error(t("deleteRegistrationFailed"))
          }

          if (submitAction) {
            submitAction()
          }
          if (formRedirect) {
            router.push(formRedirect)
          }

          message.success({
            key: "registration-delete-complete",
            content: `${t("registrationDeleteComplete")}`,
          })
        }
      } catch (e) {
        setFormError(e)
      }
      setDeleting(false)
    }, [deleteRegistration, updateToken, submitAction, formRedirect, router, t])

    const handleSubmit = useCallback(
      async (values) => {
        setFormError(null)
        try {
          const input =
            type === "create"
              ? {
                  ...values,
                  eventId,
                  quotaId,
                  registrationToken,
                }
              : {
                  ...values,
                  updateToken,
                }
          const { error } = await formMutation({ input })
          if (error) throw error

          if (submitAction) {
            submitAction()
          }
          if (formRedirect) {
            router.push(formRedirect)
          }

          type === "create"
            ? message.success({
                key: "registration-signup-complete",
                content: `${t("eventSignupComplete")}`,
              })
            : message.success({
                key: "registration-update-complete",
                content: `${t("registrationUpdateComplete")}`,
              })
        } catch (e) {
          setFormError(e)
        }
      },
      [
        registrationToken,
        updateToken,
        submitAction,
        formRedirect,
        formMutation,
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

    const showAdminEmptyAnswersNote = useMemo(() => {
      if (!isAdmin) return false

      const requiredQuestion = questions?.filter(
        ({ isRequired }) => isRequired
      )?.[0]

      if (!requiredQuestion) return false

      const answerToRequiredQuestion =
        initialValues?.answers?.[requiredQuestion?.id]
      return (
        requiredQuestion?.data?.[0]?.[lang] !== answerToRequiredQuestion?.[0]
      )
    }, [isAdmin, questions, initialValues, lang])

    return (
      <Form
        {...registrationFormItemLayout}
        colon={false}
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
          // Don't allow updating the email used in registration
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
        {questions?.map(({ id, type, data, label, isRequired }, i) => {
          let input
          if (type === QuestionType.Text) {
            input = (
              <Input data-cy={`eventregistrationform-questions-${i}-input`} />
            )
          } else if (type === QuestionType.Radio) {
            input = (
              <Radio.Group data-cy={`eventregistrationform-questions-${i}`}>
                <Space direction="vertical">
                  {data?.map((val, j) => (
                    <Radio
                      key={j}
                      data-cy={`eventregistrationform-questions-${i}-input-option-${j}`}
                      value={val[lang]}
                    >
                      {val[lang]}
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            )
          } else if (type === QuestionType.Checkbox) {
            input = (
              <Checkbox.Group>
                <Space direction="vertical">
                  {data?.map((val, j) => (
                    <Checkbox
                      key={j}
                      data-cy={`eventregistrationform-questions-${i}-input-option-${j}`}
                      value={val[lang]}
                    >
                      {val[lang]}
                    </Checkbox>
                  ))}
                </Space>
              </Checkbox.Group>
            )
          }

          return (
            <Form.Item
              key={i}
              label={label[lang]}
              name={["answers", id]}
              rules={[
                {
                  required: isRequired,
                  message: t("forms.rules.provideAnswer"),
                },
              ]}
            >
              {input}
            </Form.Item>
          )
        })}
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
            htmlType="submit"
            loading={
              formError
                ? false
                : (type === "create" && !!registrationToken) ||
                  type === "update"
                ? false
                : true
            }
            type="primary"
          >
            {t(`common:${type}`)}
          </Button>
          {type === "update" && !isAdmin ? (
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
          {isAdmin && showAdminEmptyAnswersNote ? (
            <Text style={{ display: "block", marginTop: 12 }} type="danger">
              {t("admin:registrations.update.emptyAnswers")}
            </Text>
          ) : null}
        </Form.Item>
      </Form>
    )
  },
  arePropsEqual
)
