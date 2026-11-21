import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  CreateEventRegistrationDocument,
  EventPage_QuestionFragment,
  QuestionType,
  UpdateEventRegistrationDocument,
  useClaimRegistrationTokenMutation,
  useDeleteEventRegistrationMutation,
  useSetRegistrationProfileMutation,
} from "@app/graphql"
import {
  arePropsEqual,
  buildRegistrationProfileUpdate,
  formatEuro,
  hasPrefillQuestions,
  registrationFormItemLayout,
  SERVICE_FEE_CENTS,
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
import dayjs from "dayjs"
import { useRouter } from "next/router"
import { CombinedError, useMutation } from "urql"

import { useCelebrate } from "./celebrate"
import { ErrorAlert, Feature, paymentBoxStyle, useTranslation } from "."

const { Text } = Typography

interface EventRegistrationFormProps {
  type: "update" | "create"
  isAdmin?: boolean
  questions: EventPage_QuestionFragment[]
  formRedirect?: { pathname: string; query: { [key: string]: string } } | string
  // Runs after submission/deletion; new signups include their registration ID.
  submitAction?: (registrationId?: string) => void
  // eventId and quotaId are used when type is "create"
  eventId?: string
  quotaId?: string
  // updateToken and initialValues are used when type is "update"
  updateToken?: string
  initialValues?: any
  // Used to delete an unfinished registration
  setUpdateToken?: React.Dispatch<React.SetStateAction<string | undefined>>
  // Used by the event form's preview tab: the form is validated but never
  // submitted. Leave eventId and quotaId out so no registration is claimed.
  preview?: boolean
  // Payment notice of the create form. Null or missing when the quota is
  // free or payments are disabled.
  payment?: RegistrationFormPayment | null
  // The registration being updated has been paid: deleting it warns that
  // nothing is refunded automatically
  paidOnDelete?: boolean
  // Offer to remember the answers to prefill questions in the signed-in
  // user's registration profile. Used when type is "create"
  canRememberAnswers?: boolean
}

export interface RegistrationFormPayment {
  priceCents: number
  registrationEndTime: string
}

// Same columns as the inputs of registrationFormItemLayout
const paymentFormItemLayout = {
  wrapperCol: {
    xs: { span: 24, offset: 0 },
    sm: { span: 12, offset: 6 },
  },
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
      preview,
      payment,
      paidOnDelete,
      canRememberAnswers,
    } = props

    const { t, lang } = useTranslation("register_event")
    const router = useRouter()
    const celebrate = useCelebrate()

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
    const [, setRegistrationProfile] = useSetRegistrationProfileMutation()

    // The registrant opts in to saving their answers with a checkbox, shown
    // only while prefill_answers is on and the event has prefill questions
    const offerRememberAnswers =
      type === "create" &&
      !!canRememberAnswers &&
      hasPrefillQuestions(questions)

    // Saves the answers to prefill questions after a successful registration.
    // A failure here never undoes or fails the registration itself.
    const rememberAnswers = useCallback(
      async (answers: Record<string, unknown> | undefined) => {
        const update = buildRegistrationProfileUpdate(questions, answers)
        if (!update) return
        try {
          const { error } = await setRegistrationProfile(update)
          if (error) throw error
        } catch {
          message.warning({
            key: "registration-remember-answers-failed",
            content: t("errors.rememberAnswersFailed"),
          })
        }
      },
      [questions, setRegistrationProfile, t]
    )

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
          // The checkbox is not part of the registration
          const { rememberAnswers: remember, ...registrationValues } = values
          // Names may contain spaces (e.g. "Anna Maria"), but strip the ones
          // around them
          const trimmedValues = {
            ...registrationValues,
            firstName: registrationValues.firstName?.trim(),
            lastName: registrationValues.lastName?.trim(),
          }
          const input =
            type === "create"
              ? {
                  ...trimmedValues,
                  eventId,
                  quotaId,
                  registrationToken,
                }
              : {
                  ...trimmedValues,
                  updateToken,
                }
          const { data, error } = await formMutation({ input })
          if (error) throw error

          if (type === "create") {
            celebrate()
            // The registration is finished: forget the claimed token so
            // that going back to this page (restored from the back/forward
            // cache) can't delete the registration
            setUpdateToken?.(undefined)
          }

          if (offerRememberAnswers && remember) {
            await rememberAnswers(registrationValues.answers)
          }

          if (submitAction) {
            submitAction(
              type === "create"
                ? data?.createRegistration?.registration?.id
                : undefined
            )
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
        setUpdateToken,
        submitAction,
        formRedirect,
        formMutation,
        offerRememberAnswers,
        rememberAnswers,
        router,
        eventId,
        quotaId,
        type,
        t,
        celebrate,
      ]
    )

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

    const formPayment = type === "create" ? payment : undefined
    const submitLabel = formPayment
      ? t("payment.register")
      : t(`common:${type}`)

    return (
      <Form
        {...registrationFormItemLayout}
        colon={false}
        // The preview is shown inside the event form, and a <form> nested in
        // another <form> can submit the outer one. Render a <div> instead,
        // submit with a plain button and keep Enter from submitting the
        // event form.
        component={preview ? "div" : undefined}
        form={form}
        initialValues={initialValues}
        labelWrap
        onFinish={
          preview
            ? () => {
                // Show the same celebration registrants will see
                celebrate()
                message.info(t("previewNotSubmitted"))
              }
            : handleSubmit
        }
        onKeyDown={
          preview
            ? (e: React.KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  form.submit()
                }
              }
            : undefined
        }
      >
        <Form.Item
          label={t("forms.firstName")}
          name="firstName"
          rules={[
            {
              required: true,
              whitespace: true,
              message: t("forms.rules.provideFirstName"),
            },
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
              whitespace: true,
              message: t("forms.rules.provideLastName"),
            },
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
                  {data?.map((val, j) =>
                    val ? (
                      <Radio
                        key={j}
                        data-cy={`eventregistrationform-questions-${i}-input-option-${j}`}
                        value={val[lang]}
                      >
                        {val[lang]}
                      </Radio>
                    ) : null
                  )}
                </Space>
              </Radio.Group>
            )
          } else if (type === QuestionType.Checkbox) {
            input = (
              <Checkbox.Group>
                <Space direction="vertical">
                  {data?.map((val, j) =>
                    val ? (
                      <Checkbox
                        key={j}
                        data-cy={`eventregistrationform-questions-${i}-input-option-${j}`}
                        value={val[lang]}
                      >
                        {val[lang]}
                      </Checkbox>
                    ) : null
                  )}
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
        {formPayment && (
          // Payment opens when registration closes: say so, and what it costs
          <Form.Item {...paymentFormItemLayout}>
            <section
              data-cy="eventregistrationform-payment-summary"
              style={paymentBoxStyle}
            >
              <Typography.Text strong>{t("payment.title")}</Typography.Text>
              <Typography.Text>
                {t("payment.info", {
                  price: formatEuro(formPayment.priceCents, lang),
                  fee: formatEuro(SERVICE_FEE_CENTS, lang),
                  date: dayjs(formPayment.registrationEndTime).format(
                    "D.M.YYYY"
                  ),
                  time: dayjs(formPayment.registrationEndTime).format("HH:mm"),
                })}
              </Typography.Text>
            </section>
          </Form.Item>
        )}
        {offerRememberAnswers ? (
          <Feature name="prefill_answers">
            <Form.Item
              {...tailFormItemLayout}
              name="rememberAnswers"
              valuePropName="checked"
            >
              <Checkbox data-cy="eventregistrationform-checkbox-remember-answers">
                {t("forms.rememberAnswers")}
              </Checkbox>
            </Form.Item>
          </Feature>
        ) : null}
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
            htmlType={preview ? "button" : "submit"}
            // Wait for the registration token before allowing a new
            // registration to be submitted
            loading={
              !preview && !formError && type === "create" && !registrationToken
            }
            type="primary"
            onClick={preview ? () => form.submit() : undefined}
          >
            {submitLabel}
          </Button>
          {type === "update" && !isAdmin ? (
            <Popconfirm
              cancelText={t("common:no")}
              description={
                paidOnDelete ? (
                  <div
                    data-cy="eventregistrationform-delete-no-refund-warning"
                    style={{ maxWidth: 320 }}
                  >
                    {t("payments:cancel.noRefundNote")}
                  </div>
                ) : undefined
              }
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
