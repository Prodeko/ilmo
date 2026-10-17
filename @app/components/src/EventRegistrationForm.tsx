import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  CreateEventRegistrationDocument,
  EventPage_QuestionFragment,
  QuestionType,
  UpdateEventRegistrationDocument,
  useClaimRegistrationTokenMutation,
  useCreateCheckoutSessionMutation,
  useDeleteEventRegistrationMutation,
} from "@app/graphql"
import {
  arePropsEqual,
  CancelRefund,
  formatEuro,
  registrationFormItemLayout,
  RegistrationFormPaymentVariant,
  SERVICE_FEE_CENTS,
  tailFormItemLayout,
  totalChargeCents,
} from "@app/lib"
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useRouter } from "next/router"
import { CombinedError, useMutation } from "urql"

import {
  CancelRefundBreakdown,
  ErrorAlert,
  paymentBoxStyle,
  PaymentNote,
  PriceBreakdown,
  useTranslation,
} from "."

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
  // Payment block of the create form (board 2). Null or missing when the
  // quota is free, the event has no payments or payments are disabled.
  payment?: RegistrationFormPayment | null
  // Payment of the registration being updated, for the delete confirmation
  // (board 6). Null or missing when there is nothing paid.
  paymentOnDelete?: { refund: CancelRefund | null; paidManually: boolean }
}

export interface RegistrationFormPayment {
  variant: RegistrationFormPaymentVariant
  quotaTitle: string
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
      payment,
      paymentOnDelete,
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
    const [claimedUpdateToken, setClaimedUpdateToken] = useState<
      string | undefined
    >(undefined)
    const [redirectingToCheckout, setRedirectingToCheckout] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)

    // Mutations
    const mutation =
      type === "update"
        ? UpdateEventRegistrationDocument
        : CreateEventRegistrationDocument
    const [, formMutation] = useMutation(mutation)
    const [, deleteRegistration] = useDeleteEventRegistrationMutation()
    const [, claimRegistrationToken] = useClaimRegistrationTokenMutation()
    const [, createCheckoutSession] = useCreateCheckoutSessionMutation()

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
            setClaimedUpdateToken(updateToken)
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

          // Pay during registration: go straight to Stripe Checkout. The
          // registration is already saved, so if this fails we fall back to
          // the normal success flow; the confirmation email has the link.
          if (
            type === "create" &&
            payment?.variant === "during" &&
            claimedUpdateToken
          ) {
            setRedirectingToCheckout(true)
            const { data: checkout } = await createCheckoutSession({
              updateToken: claimedUpdateToken,
              language: lang,
            })
            const url = checkout?.createCheckoutSession?.url
            if (url) {
              message.success({
                key: "registration-signup-complete",
                content: `${t("eventSignupComplete")}`,
              })
              window.location.assign(url)
              return
            }
            setRedirectingToCheckout(false)
          }

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
        claimedUpdateToken,
        payment,
        createCheckoutSession,
        lang,
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

    const paymentVariant = type === "create" ? payment?.variant : undefined
    const priceCents = payment?.priceCents ?? 0
    const totalCents = priceCents > 0 ? totalChargeCents(priceCents) : 0
    const submitLabel =
      paymentVariant === "during"
        ? t("payment.registerAndPay", {
            total: formatEuro(totalCents, lang),
          })
        : paymentVariant === "after"
          ? t("payment.register")
          : paymentVariant === "queued"
            ? t("payment.joinQueue")
            : t(`common:${type}`)
    const refundOnDelete = paymentOnDelete?.refund

    return (
      <Form
        {...registrationFormItemLayout}
        colon={false}
        form={form}
        initialValues={initialValues}
        labelWrap
        onFinish={handleSubmit}
      >
        {paymentVariant === "queued" && (
          <Form.Item {...paymentFormItemLayout}>
            <Alert
              data-cy="eventregistrationform-payment-queue-notice"
              message={t("payment.queueNotice")}
              type="warning"
            />
          </Form.Item>
        )}
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
        {paymentVariant === "during" && (
          <Form.Item {...paymentFormItemLayout}>
            <section
              data-cy="eventregistrationform-payment-summary"
              style={paymentBoxStyle}
            >
              <Typography.Text strong>{t("payment.title")}</Typography.Text>
              <PriceBreakdown
                lang={lang}
                priceCents={priceCents}
                serviceFeeCents={SERVICE_FEE_CENTS}
                serviceFeeLabel={t("payment.serviceFee")}
                ticketLabel={t("payment.ticket", {
                  quota: payment?.quotaTitle,
                })}
                totalCents={totalCents}
                totalLabel={t("payment.total")}
              />
              <PaymentNote>{t("payment.duringInfo")}</PaymentNote>
            </section>
          </Form.Item>
        )}
        {paymentVariant === "after" && (
          <Form.Item {...paymentFormItemLayout}>
            <section
              data-cy="eventregistrationform-payment-summary"
              style={paymentBoxStyle}
            >
              <Typography.Text strong>{t("payment.title")}</Typography.Text>
              <Typography.Text>
                {t("payment.afterInfo", {
                  price: formatEuro(priceCents, lang),
                  fee: formatEuro(SERVICE_FEE_CENTS, lang),
                  date: dayjs(payment?.registrationEndTime).format("D.M.YYYY"),
                  time: dayjs(payment?.registrationEndTime).format("HH:mm"),
                })}
              </Typography.Text>
            </section>
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
            htmlType="submit"
            loading={
              redirectingToCheckout
                ? true
                : formError
                  ? false
                  : (type === "create" && !!registrationToken) ||
                      type === "update"
                    ? false
                    : true
            }
            type="primary"
          >
            {redirectingToCheckout ? t("payment.redirecting") : submitLabel}
          </Button>
          {type === "update" && !isAdmin && refundOnDelete ? (
            <>
              <Button
                data-cy="eventregistrationform-button-delete-registration"
                loading={deleting}
                style={{ marginLeft: 5 }}
                danger
                onClick={() => setDeleteModalOpen(true)}
              >
                {t("deleteRegistration")}
              </Button>
              <Modal
                cancelText={t("payments:cancel.keep")}
                data-cy="eventregistrationform-delete-refund-modal"
                okButtonProps={{
                  danger: true,
                  loading: deleting,
                  // @ts-ignore data-cy is passed through to the button
                  "data-cy": "eventregistrationform-button-delete-and-refund",
                }}
                okText={t("payments:cancel.deleteAndRefund", {
                  amount: formatEuro(refundOnDelete.refundCents, lang),
                })}
                open={deleteModalOpen}
                title={t("payments:cancel.title")}
                onCancel={() => setDeleteModalOpen(false)}
                onOk={async () => {
                  await doDelete()
                  setDeleteModalOpen(false)
                }}
              >
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Typography.Text>{t("payments:cancel.body")}</Typography.Text>
                  <CancelRefundBreakdown
                    feeLabel={t("payments:cancel.feeNotRefunded")}
                    lang={lang}
                    paidLabel={t("payments:cancel.youPaid")}
                    refund={refundOnDelete}
                    refundLabel={t("payments:cancel.refundToCard")}
                  />
                  <PaymentNote>{t("payments:cancel.refundTiming")}</PaymentNote>
                </Space>
              </Modal>
            </>
          ) : type === "update" && !isAdmin ? (
            <Popconfirm
              cancelText={t("common:no")}
              description={
                paymentOnDelete?.paidManually ? (
                  <div style={{ maxWidth: 320 }}>
                    {t("payments:cancel.manualNote")}
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
