import { Head, IlmoContext, TopProgressBar } from "@app/components"
import { withUrql } from "@app/lib"
import { ConfigProvider, theme } from "antd"
import { AppProps } from "next/app"
import { WithUrqlProps } from "next-urql"

import { setLocale } from "../utils/dayjs"

import "../styles/fonts.css"
import "../styles/global.css"
import "nprogress/nprogress.css"
import "react-color-palette/lib/css/styles.css"

// antd v5 theme tokens. The values below replicate the Less variables that
// the v4 build compiled in via `next-plugin-antd-less`.
const ilmoTheme = {
  token: {
    colorPrimary: "#002e7d",
    fontFamily:
      "Raleway, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    colorText: "rgba(10, 10, 10, 1)",
    colorBgLayout: "#f5faff",
  },
  components: {
    Layout: {
      headerBg: "#fff",
      headerPadding: "0 1rem",
      footerBg: "#f5faff",
      bodyBg: "#fff",
    },
  },
  algorithm: theme.defaultAlgorithm,
}

const Ilmo = (props: AppProps & WithUrqlProps) => {
  const { Component, pageProps, resetUrqlClient, router } = props
  const antdLocale = setLocale(router.locale)

  return (
    <IlmoContext.Provider value={{ resetUrqlClient }}>
      <ConfigProvider locale={antdLocale} theme={ilmoTheme}>
        <TopProgressBar />
        <Head />
        <Component {...pageProps} resetUrqlClient={resetUrqlClient} />
      </ConfigProvider>
    </IlmoContext.Provider>
  )
}

export default withUrql(Ilmo)
