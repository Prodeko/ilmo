import * as React from "react";
import { ApolloClient, ApolloProvider } from "@apollo/client";
import { withApollo } from "@app/lib";
import * as Sentry from "@sentry/react";
import { Integrations as TracingIntegrations } from "@sentry/tracing";
import { ConfigProvider, notification } from "antd";
import enUS from "antd/lib/locale/en_US";
import fiFI from "antd/lib/locale/fi_FI";
import dayjs from "dayjs";
import App, { AppContext } from "next/app";
import Router from "next/router";
import NProgress from "nprogress";

import "dayjs/locale/fi";
import "dayjs/locale/en-gb";
import "../styles/styles.less";

import "nprogress/nprogress.css";

declare global {
  interface Window {
    __GRAPHILE_APP__: {
      ROOT_URL?: string;
      T_AND_C_URL?: string;
      SENTRY_DSN?: string;
    };
  }
}

NProgress.configure({
  showSpinner: false,
});

if (typeof window !== "undefined") {
  const nextDataEl = document.getElementById("__NEXT_DATA__");
  if (!nextDataEl || !nextDataEl.textContent) {
    throw new Error("Cannot read from __NEXT_DATA__ element");
  }
  const data = JSON.parse(nextDataEl.textContent);
  const { ROOT_URL, T_AND_C_URL, SENTRY_DSN } = data.query;
  window.__GRAPHILE_APP__ = {
    ROOT_URL,
    T_AND_C_URL,
    SENTRY_DSN,
  };

  if (SENTRY_DSN) {
    Sentry.init({
      environment: process.env.NODE_ENV,
      dsn: SENTRY_DSN,
      integrations: [new TracingIntegrations.BrowserTracing()],
      tracesSampleRate: 1,
    });
  }

  Router.events.on("routeChangeStart", () => {
    NProgress.start();
  });
  Router.events.on("routeChangeComplete", () => {
    NProgress.done();
  });
  Router.events.on("routeChangeError", (err: Error | string) => {
    NProgress.done();
    if (err["cancelled"]) {
      // No worries; you deliberately cancelled it
    } else {
      notification.open({
        message: "Page load failed",
        description: `This is very embarrassing! Please reload the page. Further error details: ${
          typeof err === "string" ? err : err.message
        }`,
        duration: 0,
      });
    }
  });
}

interface Props {
  apollo: ApolloClient<any>;
  locale: string;
}

class Ilmo extends App<Props> {
  static async getInitialProps(appContext: AppContext) {
    const { router } = appContext;

    const locale = router.locale;
    // TODO: Not sure if this is the best place for this..
    dayjs.locale(locale === "en" ? "en-gb" : "fi");

    const appProps = await App.getInitialProps(appContext);

    return { ...appProps, locale };
  }

  render() {
    const { Component, pageProps, apollo, locale } = this.props;

    return (
      <Sentry.ErrorBoundary fallback={"An error has occurred"}>
        <ApolloProvider client={apollo}>
          <ConfigProvider locale={locale === "en" ? enUS : fiFI}>
            <Component {...pageProps} />
          </ConfigProvider>
        </ApolloProvider>
      </Sentry.ErrorBoundary>
    );
  }
}

export default Sentry.withProfiler(withApollo(Ilmo));
