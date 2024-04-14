import React from "react"
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs"
import Document, { Head, Html, Main, NextScript } from "next/document"

import type { DocumentContext } from "next/document"

class CustomDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <link
            as="font"
            crossOrigin="anonymous"
            href="/fonts/Raleway-Italic-VariableFont_wght-subset.woff2"
            rel="preload"
            type="font/woff2"
          />
          <link
            as="font"
            crossOrigin="anonymous"
            href="/fonts/Raleway-VariableFont_wght-subset.woff2"
            rel="preload"
            type="font/woff2"
          />
          {process.env.ENV === "production" && (
            <script
              data-account-id="2b404169-9d56-4686-be6c-eb30fd8cf8eb"
              src="https://usage.prodeko.org/script.js"
              async
            />
          )}
        </Head>
        <body>
          <Main />
          <div id="alert" />
          <NextScript />
        </body>
      </Html>
    )
  }
}

CustomDocument.getInitialProps = async (ctx: DocumentContext) => {
  const cache = createCache()
  const originalRenderPage = ctx.renderPage
  ctx.renderPage = () =>
    originalRenderPage({
      enhanceApp: (App) => (props) => (
        <StyleProvider cache={cache}>
          <App {...props} />
        </StyleProvider>
      ),
    })

  const initialProps = await Document.getInitialProps(ctx)
  const style = extractStyle(cache, true)
  return {
    ...initialProps,
    styles: (
      <>
        {initialProps.styles}
        <style dangerouslySetInnerHTML={{ __html: style }} />
      </>
    ),
  }
}

export default CustomDocument
