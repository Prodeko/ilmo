import Document, {
  DocumentContext,
  Head,
  Html,
  Main,
  NextScript,
} from "next/document"

class CustomDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

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

export default CustomDocument
