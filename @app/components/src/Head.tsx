import NextHead from "next/head"

import { useTranslation } from "."

export const Head: React.FC = () => {
  const { t, lang } = useTranslation("common")

  return (
    <NextHead>
      <title key="title">{t("head.title")}</title>
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <meta content={t("head.description")} name="description" />
      <link href="/favicon.png" rel="icon" type="image/png" />

      <meta content="index,follow" name="robots" />
      <meta content="index,follow" name="googlebot" />
      <meta content="nositelinkssearchbox" name="google" />
      <meta content="notranslate" name="google" />

      <meta content={t("head.title")} property="og:title" />
      <meta content={t("head.description")} property="og:description" />
      <meta content={lang} property="og:locale" />
      <meta content="/favicon.png" property="og:image" />

      <meta content="summary" name="twitter:card" />
      <meta content={t("head.title")} name="twitter:title" />
      <meta content={t("head.description")} name="twitter:description" />
      <meta content="/favicon.png" property="twitter:image" />
    </NextHead>
  )
}
