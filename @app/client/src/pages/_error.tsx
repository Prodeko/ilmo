import { ErrorOccurred, SharedLayout, useTranslation } from "@app/components"
import { useSharedQuery } from "@app/graphql"
import * as Sentry from "@sentry/nextjs"
import { Col, Row } from "antd"
import { NextPageContext } from "next"
import NextErrorComponent from "next/error"

import type { ErrorProps as NextErrorProps } from "next/error"

export type ErrorPageProps = {
  statusCode: number
  children?: React.ReactElement
}

export type ErrorProps = NextErrorProps

const ErrorPage = (_props: ErrorPageProps) => {
  const { t } = useTranslation("error")
  const [query] = useSharedQuery()

  return (
    <SharedLayout query={query} title={t("errorOccurred")}>
      <Row>
        <Col flex={1}>
          <ErrorOccurred />
        </Col>
      </Row>
    </SharedLayout>
  )
}

ErrorPage.getInitialProps = async (contextData: NextPageContext) => {
  // Capture errors via Sentry's helper, which handles the
  // `getInitialProps` skip in https://github.com/vercel/next.js/issues/8592
  // and awaits flushing in serverless environments.
  await Sentry.captureUnderscoreErrorException(contextData)

  return NextErrorComponent.getInitialProps(contextData)
}

export default ErrorPage
