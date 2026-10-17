import { useMemo } from "react"
import {
  EventRegistrationForm,
  Link,
  PageHeader,
  Redirect,
  SharedLayout,
  useTranslation,
} from "@app/components"
import {
  RegistrationPaymentStatus,
  useUpdateEventRegistrationPageQuery,
} from "@app/graphql"
import {
  cancelRefund,
  filterObjectByKeys,
  formatEuro,
  payPageState,
} from "@app/lib"
import { Alert, Col, Row } from "antd"
import dayjs from "dayjs"
import { useRouter } from "next/router"

import type { NextPage } from "next"

type UpdateFormInitialValues = {
  firstName: string
  lastName: string
  answers: any
}

function constructInitialValues(values: any) {
  const filteredValues = filterObjectByKeys(values, [
    "firstName",
    "lastName",
    "answers",
  ]) as UpdateFormInitialValues

  return filteredValues
}

const UpdateEventRegistrationPage: NextPage = () => {
  const { t, lang } = useTranslation("register_event")
  const router = useRouter()
  const { updateToken } = router.query

  const [query] = useUpdateEventRegistrationPageQuery({
    variables: { updateToken: updateToken as string },
  })
  const { data, fetching, error, stale } = query

  const registration = data?.registrationByUpdateToken
  const event = registration?.event
  const quota = registration?.quota

  // Payments (board 6). paymentByUpdateToken is null while payments are off.
  const payment = data?.paymentByUpdateToken
  const paymentOnDelete = useMemo(() => {
    if (!payment) return undefined
    const paidManually =
      payment.status === RegistrationPaymentStatus.PaidManually ||
      (payment.status === RegistrationPaymentStatus.Paid &&
        payment.paidManually)
    const refund = cancelRefund(payment)
    return refund || paidManually ? { refund, paidManually } : undefined
  }, [payment])
  const payState = payment ? payPageState(data?.paymentsEnabled, payment) : null

  // If registration is not found redirect to index
  if (!fetching && !error && !registration && !stale) {
    return <Redirect href="/" layout />
  }

  return (
    <SharedLayout query={query} title="">
      <PageHeader title={t("updateRegistration.title")} />
      <Row>
        <Col sm={{ offset: 6 }} style={{ marginBottom: 12 }}>
          {event?.name[lang]} - {quota?.title[lang]}
        </Col>
      </Row>
      {(payState === "paid" || payState === "paidManually") && (
        <Row>
          <Col
            sm={{ offset: 6, span: 12 }}
            style={{ marginBottom: 16 }}
            xs={24}
          >
            <Alert
              data-cy="updateregistration-paid-banner"
              message={t("payments:paidBanner", {
                amount: formatEuro(payment?.paidTotalCents ?? 0, lang),
                date: payment?.paidAt
                  ? dayjs(payment.paidAt).format("D.M.YYYY")
                  : "",
              })}
              type="success"
            />
          </Col>
        </Row>
      )}
      {payState === "unpaid" && (
        <Row>
          <Col
            sm={{ offset: 6, span: 12 }}
            style={{ marginBottom: 16 }}
            xs={24}
          >
            <Alert
              action={
                <Link
                  data-cy="updateregistration-link-pay"
                  href={{
                    pathname: "/pay/[updateToken]",
                    query: { updateToken: updateToken as string },
                  }}
                >
                  {t("payments:payNow")}
                </Link>
              }
              data-cy="updateregistration-unpaid-banner"
              message={t("payments:unpaidBanner")}
              type="warning"
            />
          </Col>
        </Row>
      )}
      <EventRegistrationForm
        formRedirect={{
          pathname: "/event/[slug]",
          query: { slug: event?.slug },
        }}
        initialValues={constructInitialValues(registration)}
        paymentOnDelete={paymentOnDelete}
        questions={event?.eventQuestions?.nodes}
        type="update"
        updateToken={updateToken as string}
      />
    </SharedLayout>
  )
}

export default UpdateEventRegistrationPage
