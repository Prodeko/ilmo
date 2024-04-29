import React from "react"
import { Head, IlmoContext, TopProgressBar } from "@app/components"
import { withUrql } from "@app/lib"
import { ConfigProvider } from "antd"
import dayjs from "dayjs"
import localizedFormat from "dayjs/plugin/localizedFormat"
import { AppProps } from "next/app"
import appWithI18n from "next-translate/appWithI18n"
import { WithUrqlProps } from "next-urql"

import i18nConfig from "../../i18n"
import theme from "../styles/themeConfig"
import { setLocale } from "../utils/dayjs"

import "react-color-palette/dist/css/rcp.css"
import "../styles/fonts.css"
import "nprogress/nprogress.css"

dayjs.extend(localizedFormat)

const Ilmo = (props: AppProps & WithUrqlProps) => {
  const { Component, pageProps, resetUrqlClient, router } = props
  const antdLocale = setLocale(router.locale)

  return (
    <IlmoContext.Provider value={{ resetUrqlClient }}>
      <ConfigProvider locale={antdLocale} theme={theme}>
        <TopProgressBar />
        <Head />
        <Component {...pageProps} resetUrqlClient={resetUrqlClient} />
      </ConfigProvider>
    </IlmoContext.Provider>
  )
}

export default appWithI18n(withUrql(Ilmo) as any, {
  ...i18nConfig,
  loadLocaleFrom: (lang, ns) => {
    return import(`../translations/${lang}/${ns}.json`)
  },
})
