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
          <script data-account-id="2b404169-9d56-4686-be6c-eb30fd8cf8eb" src="https://usage.prodeko.org/script.js" async />
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
