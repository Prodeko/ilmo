import { Head, IlmoContext, TopProgressBar } from "@app/components"
import { withUrql } from "@app/lib"
import { ConfigProvider } from "antd"
import { AppProps } from "next/app"
import { WithUrqlProps } from "next-urql"

import { setLocale } from "../utils/dayjs"

import "../styles/fonts.css"
import "nprogress/nprogress.css"
import "react-color-palette/lib/css/styles.css"

const Ilmo = (props: AppProps & WithUrqlProps) => {
  const { Component, pageProps, resetUrqlClient, router } = props
  const antdLocale = setLocale(router.locale)

  return (
    <IlmoContext.Provider value={{ resetUrqlClient }}>
      <ConfigProvider locale={antdLocale}>
        <TopProgressBar />
        <Head />
        <Component {...pageProps} resetUrqlClient={resetUrqlClient} />
      </ConfigProvider>
    </IlmoContext.Provider>
  )
}

export default withUrql(Ilmo)
