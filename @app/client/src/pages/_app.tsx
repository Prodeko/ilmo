import * as React from "react";
import { ApolloClient, ApolloProvider } from "@apollo/client";
import { withApollo } from "@app/lib";
import { ConfigProvider, notification } from "antd";
import enUS from "antd/lib/locale/en_US";
import fiFI from "antd/lib/locale/fi_FI";
import App from "next/app";
import Router from "next/router";
import NProgress from "nprogress";

import "antd/dist/antd.less";
import "../styles.less";

import "nprogress/nprogress.css";

declare global {
  interface Window {
    __GRAPHILE_APP__: {
      ROOT_URL?: string;
      T_AND_C_URL?: string;
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
  window.__GRAPHILE_APP__ = {
    ROOT_URL: data.query.ROOT_URL,
    T_AND_C_URL: data.query.T_AND_C_URL,
  };

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
  static async getInitialProps({ Component, ctx, router }: any) {
    let pageProps = { locale: router.locale };

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx);
    }

    return { pageProps };
  }

  render() {
    const { Component, pageProps, apollo, locale } = this.props;

    return (
      <ApolloProvider client={apollo}>
        <ConfigProvider locale={locale === "en" ? enUS : fiFI}>
          <Component {...pageProps} />
        </ConfigProvider>
      </ApolloProvider>
    );
  }
}

export default withApollo(Ilmo);
