import { ErrorOccurred, SharedLayout, useTranslation } from "@app/components"
import { useSharedQuery } from "@app/graphql"
import * as Sentry from "@sentry/nextjs"
import { Col, Row } from "antd"
import { NextPageContext } from "next"
import NextErrorComponent from "next/error"

import type { ErrorProps as NextErrorProps } from "next/error"

export type ErrorPageProps = {
  err: Error
  statusCode: number
  hasGetInitialPropsRun: boolean
  children?: React.ReactElement
}

export type ErrorProps = {
  hasGetInitialPropsRun: boolean
} & NextErrorProps

const ErrorPage = (props: ErrorPageProps) => {
  if (!props.hasGetInitialPropsRun && props.err) {
    // getInitialProps is not called in case of
    // https://github.com/vercel/next.js/issues/8592. As a workaround, we pass
    // err via _app.js so it can be captured
    Sentry.captureException(props.err)
    // Flushing is not required in this case as it only happens on the client
  }

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

ErrorPage.getInitialProps = async ({
  res,
  err,
  asPath,
  AppTree,
  pathname,
  query,
}: NextPageContext) => {
  const errorInitialProps: ErrorProps = {
    hasGetInitialPropsRun: false,
    ...(await NextErrorComponent.getInitialProps({
      res,
      err,
      pathname,
      query,
      AppTree,
    })),
  }

  // Workaround for https://github.com/vercel/next.js/issues/8592, mark when
  // getInitialProps has run
  errorInitialProps.hasGetInitialPropsRun = true

  // Running on the server, the response object (`res`) is available.
  //
  // Next.js will pass an err on the server if a page's data fetching methods
  // threw or returned a Promise that rejected
  //
  // Running on the client (browser), Next.js will provide an err if:
  //
  //  - a page's `getInitialProps` threw or returned a Promise that rejected
  //  - an exception was thrown somewhere in the React lifecycle (render,
  //    componentDidMount, etc) that was caught by Next.js's React Error
  //    Boundary. Read more about what types of exceptions are caught by Error
  //    Boundaries: https://reactjs.org/docs/error-boundaries.html

  if (err) {
    Sentry.captureException(err)

    return errorInitialProps
  }

  // If this point is reached, getInitialProps was called without any
  // information about what the error might be. This is unexpected and may
  // indicate a bug introduced in Next.js, so record it in Sentry
  Sentry.captureException(
    new Error(`_error.js getInitialProps missing data at path: ${asPath}`)
  )
  await Sentry.flush(2000)

  const statusCode = res
    ? res.statusCode
    : err
    ? err["statusCode"] || null
    : null

  return { statusCode, ...errorInitialProps }
}

export default ErrorPage
