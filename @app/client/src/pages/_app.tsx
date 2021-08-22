import * as React from "react"
import { Head } from "@app/components"
import { withUrql } from "@app/lib"
import * as Sentry from "@sentry/react"
import { Integrations as TracingIntegrations } from "@sentry/tracing"
import { ConfigProvider, notification } from "antd"
import enUS from "antd/lib/locale/en_US"
import fiFI from "antd/lib/locale/fi_FI"
import dayjs from "dayjs"
import {
  AnimatePresence,
  AnimateSharedLayout,
  domMax,
  LazyMotion,
} from "framer-motion"
import App, { AppContext } from "next/app"
import Router from "next/router"
import NProgress from "nprogress"

import "dayjs/locale/fi"
import "dayjs/locale/en-gb"

import ErrorPage from "./_error"

import "nprogress/nprogress.css"
import "react-color-palette/lib/css/styles.css"

require("../styles/styles.less")

declare global {
  interface Window {
    __ILMO_APP__: {
      ROOT_URL?: string
      T_AND_C_URL?: string
      SENTRY_DSN?: string
      ENABLE_REGISTRATION?: number
    }
  }
}

NProgress.configure({
  showSpinner: false,
})

if (typeof window !== "undefined") {
  const nextDataEl = document.getElementById("__NEXT_DATA__")
  if (!nextDataEl || !nextDataEl.textContent) {
    throw new Error("Cannot read from __NEXT_DATA__ element")
  }
  const data = JSON.parse(nextDataEl.textContent)
  const { ROOT_URL, T_AND_C_URL, SENTRY_DSN, ENABLE_REGISTRATION } = data.query
  window.__ILMO_APP__ = {
    ROOT_URL,
    T_AND_C_URL,
    SENTRY_DSN,
    ENABLE_REGISTRATION,
  }

  if (SENTRY_DSN) {
    Sentry.init({
      environment: process.env.NODE_ENV,
      dsn: SENTRY_DSN,
      integrations: [new TracingIntegrations.BrowserTracing()],
      tracesSampleRate: 0.3,
    })
  }

  Router.events.on("routeChangeStart", () => {
    NProgress.start()
  })
  Router.events.on("routeChangeComplete", () => {
    NProgress.done()
  })
  Router.events.on("routeChangeError", (err: Error | string) => {
    NProgress.done()
    if (err["cancelled"]) {
      // No worries; you deliberately cancelled it
    } else {
      notification.open({
        message: "Page load failed",
        description: `This is very embarrassing! Please reload the page. Further error details: ${
          typeof err === "string" ? err : err.message
        }`,
        duration: 0,
      })
    }
  })
}

interface Props {
  locale: string
}

class Ilmo extends App<Props> {
  static async getInitialProps(appContext: AppContext) {
    const { router } = appContext

    const { locale } = router
    // TODO: Not sure if this is the best place for this..
    dayjs.locale(locale === "en" ? "en-gb" : "fi")

    const appProps = await App.getInitialProps(appContext)

    return { ...appProps, locale }
  }

  render() {
    // @ts-ignore
    const { Component, pageProps, resetUrqlClient, locale } = this.props

    return (
      <Sentry.ErrorBoundary fallback={<ErrorPage statusCode={500} />}>
        <ConfigProvider locale={locale === "en" ? enUS : fiFI}>
          <Head />
          <LazyMotion features={domMax} strict>
            <AnimateSharedLayout>
              <AnimatePresence
                exitBeforeEnter
                onExitComplete={() => window.scrollTo(0, 0)}
              >
                <Component {...pageProps} resetUrqlClient={resetUrqlClient} />
              </AnimatePresence>
            </AnimateSharedLayout>
          </LazyMotion>
        </ConfigProvider>
      </Sentry.ErrorBoundary>
    )
  }
}

export default Sentry.withProfiler(withUrql(Ilmo))
