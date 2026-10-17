import { useCallback, useEffect, useState } from "react"
import {
  Link,
  LoadingPadded,
  PaymentCard,
  SharedLayout,
  useTranslation,
} from "@app/components"
import {
  PaymentErrorCode,
  useCreateCheckoutSessionMutation,
  usePayPageQuery,
} from "@app/graphql"
import { getCodeFromError, isStripeCheckoutUrl, payPageState } from "@app/lib"
import { Alert, Col, Result, Row } from "antd"
import { useRouter } from "next/router"

import type { NextPage } from "next"

// After Stripe redirects back with status=success the webhook usually marks
// the payment paid within seconds; poll until then, but not forever
const CONFIRM_POLL_INTERVAL_MS = 2000
const CONFIRM_POLL_TIMEOUT_MS = 30000

const BLOCKED_CODES = Object.values(PaymentErrorCode) as string[]

const PayPage: NextPage = () => {
  const { t, lang } = useTranslation("payments")
  const router = useRouter()
  const updateToken = router.query.updateToken as string
  const returnStatus = (router.query.status as string | undefined) ?? null

  const [query, refetch] = usePayPageQuery({
    variables: { updateToken },
    pause: !updateToken,
    requestPolicy: "network-only",
  })
  const { data, fetching, stale } = query
  const payment = data?.paymentByUpdateToken

  const [confirmTimedOut, setConfirmTimedOut] = useState(false)
  const state = payPageState(data?.paymentsEnabled, payment, {
    returnStatus,
    confirmTimedOut,
  })

  // Poll while confirming (board 4, "Returned, confirming")
  const confirming = state === "confirming"
  useEffect(() => {
    if (!confirming) return
    const startedAt = Date.now()
    const interval = setInterval(() => {
      if (Date.now() - startedAt >= CONFIRM_POLL_TIMEOUT_MS) {
        setConfirmTimedOut(true)
        clearInterval(interval)
        return
      }
      refetch({ requestPolicy: "network-only" })
    }, CONFIRM_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [confirming, refetch])

  const [, createCheckoutSession] = useCreateCheckoutSessionMutation()
  const [paying, setPaying] = useState(false)
  const [payFailed, setPayFailed] = useState(false)

  const handlePay = useCallback(async () => {
    setPayFailed(false)
    setPaying(true)
    const { data: checkout, error } = await createCheckoutSession({
      updateToken,
      language: lang,
    })
    const url = checkout?.createCheckoutSession?.url
    if (isStripeCheckoutUrl(url)) {
      // Keep the button loading while the browser navigates to Stripe
      window.location.assign(url!)
      return
    }
    setPaying(false)
    const code = getCodeFromError(error ?? null)
    if (code && BLOCKED_CODES.includes(code)) {
      // The registration changed state (e.g. paid in another tab): show it
      refetch({ requestPolicy: "network-only" })
    } else {
      // Show only a generic message: error details are not for visitors
      setPayFailed(true)
    }
  }, [createCheckoutSession, updateToken, lang, refetch])

  let content: React.ReactNode
  if (!data && (fetching || stale || !updateToken)) {
    content = <LoadingPadded size="huge" />
  } else if (state === "disabled") {
    content = (
      <Result
        data-cy="paypage-disabled"
        status="info"
        subTitle={t("disabled.body")}
        title={t("disabled.title")}
      />
    )
  } else if (state === "notFound" || !payment) {
    content = (
      <Result
        data-cy="paypage-not-found"
        status="404"
        subTitle={t("notFound.body")}
        title={t("notFound.title")}
      />
    )
  } else {
    content = (
      <>
        <PaymentCard
          error={
            payFailed ? (
              <Alert
                data-cy="paypage-checkout-failed"
                message={t("errors.checkoutFailed")}
                type="error"
                showIcon
              />
            ) : null
          }
          paying={paying}
          payment={payment}
          returnStatus={returnStatus}
          state={state}
          onPay={handlePay}
        />
        <div style={{ marginTop: 16 }}>
          <Link
            data-cy="paypage-link-update-registration"
            href={{
              pathname: "/update-registration/[updateToken]",
              query: { updateToken },
            }}
          >
            {t("editRegistration")}
          </Link>
        </div>
      </>
    )
  }

  return (
    <SharedLayout query={query} title={t("title")}>
      <Row justify="center">
        <Col lg={12} md={16} xs={24}>
          {content}
        </Col>
      </Row>
    </SharedLayout>
  )
}

export default PayPage
