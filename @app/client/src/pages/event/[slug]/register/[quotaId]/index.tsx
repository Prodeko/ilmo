import { ComponentProps, useCallback, useMemo, useState } from "react"
import {
  EventRegistrationForm,
  PageHeader,
  RecentRegistrationsList,
  Redirect,
  SharedLayout,
  useFeature,
  useLoading,
  useTranslation,
} from "@app/components"
import {
  CreateEventRegistrationPageQuery,
  RegistrationStatus,
  useClaimedRegistrationStatusQuery,
  useCreateEventRegistrationPageQuery,
  useDeleteEventRegistrationMutation,
} from "@app/graphql"
import {
  buildRegistrationInitialValues,
  quotaRequiresPayment,
  registrationFormPaymentVariant,
  RegistrationPrefillUser,
} from "@app/lib"
import { Col, Popconfirm, Row } from "antd"
import { useRouter } from "next/router"

import type { NextPage } from "next"

interface PrefilledRegistrationFormProps
  extends Omit<
    ComponentProps<typeof EventRegistrationForm>,
    "initialValues" | "payment" | "paymentLoading"
  > {
  currentUser: RegistrationPrefillUser | null | undefined
  event: CreateEventRegistrationPageQuery["eventBySlug"]
  quota: CreateEventRegistrationPageQuery["quota"]
  // The token of the spot claimed when the form opened
  updateToken: string | undefined
}

/**
 * The create form with its initial values and payment block. Rendered inside
 * SharedLayout so that useFeature reads the flags the layout provides.
 */
const PrefilledRegistrationForm = ({
  currentUser,
  questions,
  event,
  quota,
  updateToken,
  ...formProps
}: PrefilledRegistrationFormProps) => {
  const { lang } = useTranslation("register_event")
  // Payments: the form shows a payment block for paid quotas, and a queue
  // notice instead when the spot claimed on opening the form is in the queue
  const paymentsEnabled = useFeature("payments")
  const requiresPayment = quotaRequiresPayment(
    paymentsEnabled,
    event?.paymentMode,
    quota?.priceCents
  )
  const [claimedStatusQuery] = useClaimedRegistrationStatusQuery({
    variables: { updateToken: updateToken as string },
    pause: !updateToken || !requiresPayment,
    requestPolicy: "network-only",
  })
  // Until the claimed spot's status is known, the submit button waits
  const paymentLoading =
    requiresPayment &&
    !!updateToken &&
    !claimedStatusQuery.data?.registrationByUpdateToken &&
    !claimedStatusQuery.error
  const isQueued =
    claimedStatusQuery.data?.registrationByUpdateToken?.status ===
    RegistrationStatus.InQueue
  const payment = useMemo(() => {
    const variant = registrationFormPaymentVariant(
      paymentsEnabled,
      event?.paymentMode,
      quota?.priceCents,
      isQueued
    )
    return variant
      ? {
          variant,
          quotaTitle: quota?.title?.[lang] ?? "",
          priceCents: quota?.priceCents ?? 0,
          registrationEndTime: event?.registrationEndTime,
        }
      : null
  }, [paymentsEnabled, event, quota, isQueued, lang])
  const keycloakNames = useFeature("keycloak_names")
  const prefillAnswers = useFeature("prefill_answers")
  const initialValues = useMemo(
    () =>
      buildRegistrationInitialValues({
        currentUser,
        questions,
        features: {
          keycloak_names: keycloakNames,
          prefill_answers: prefillAnswers,
        },
      }),
    [currentUser, questions, keycloakNames, prefillAnswers]
  )

  return (
    <EventRegistrationForm
      {...formProps}
      canRememberAnswers={!!currentUser && prefillAnswers}
      initialValues={initialValues}
      payment={payment}
      paymentLoading={paymentLoading}
      questions={questions}
    />
  )
}

const EventRegistrationPage: NextPage = () => {
  const { t, lang } = useTranslation("register_event")
  const [visible, setVisible] = useState(false)

  const router = useRouter()
  const slug = router.query.slug as string
  const quotaId = router.query.quotaId as string

  const [query] = useCreateEventRegistrationPageQuery({
    variables: { slug, quotaId },
  })
  const { data, fetching, error, stale } = query

  const currentUser = data?.currentUser
  const event = data?.eventBySlug
  const quota = data?.quota
  const { signupClosed, signupUpcoming } = event || {}

  const questions = event?.eventQuestions?.nodes

  const [, deleteRegistration] = useDeleteEventRegistrationMutation()
  const [updateToken, setUpdateToken] = useState<string | undefined>(undefined)
  const loadingElement = useLoading(query, "eventBySlug")

  const handleGoBack = useCallback(async () => {
    // Delete the pending registration if the user goes back to event page
    if (updateToken) {
      await deleteRegistration({
        updateToken,
      })
    }
    router.push(`/event/${event.slug}`)
  }, [deleteRegistration, router, event, updateToken])

  // If event or quota is not found, or if event
  // registration is not open redirect to index
  if (
    !fetching &&
    !error &&
    !stale &&
    (!event || !quota || signupClosed || signupUpcoming)
  ) {
    return <Redirect href="/" layout />
  }

  const showPopconfirm = (e?: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    setVisible(true)
  }

  const hidePopconfirm = () => {
    setVisible(false)
  }

  const eventName = event?.name[lang] || t("common:loading")
  const quotaName = quota?.title[lang] || t("common:loading")
  const title = `${t("title")} ${eventName} - ${quotaName}`

  return (
    <SharedLayout query={query} title="">
      {loadingElement || (
        <>
          <Row align="top" justify="center">
            <Col sm={12} xs={24}>
              <PageHeader title={title} onBack={showPopconfirm} />
              <Popconfirm
                cancelText={t("common:no")}
                okText={t("common:yes")}
                open={visible}
                title={t("confirmGoBack")}
                onCancel={hidePopconfirm}
                onConfirm={handleGoBack}
              />
            </Col>
          </Row>
          <PrefilledRegistrationForm
            currentUser={currentUser}
            event={event}
            eventId={event?.id}
            formRedirect={{
              pathname: "/event/[slug]",
              query: { slug: event?.slug },
            }}
            questions={questions}
            quota={quota}
            quotaId={quota?.id}
            // Used to delete an unfinished registration
            setUpdateToken={setUpdateToken}
            submitAction={(registrationId) => {
              try {
                sessionStorage.setItem(
                  `registered-event:${event.id}`,
                  registrationId || "1"
                )
              } catch {
                // Storage is optional; do not interrupt a successful signup.
              }
            }}
            type="create"
            updateToken={updateToken}
          />
          <RecentRegistrationsList eventId={event.id} />
        </>
      )}
    </SharedLayout>
  )
}

export default EventRegistrationPage
