import Link from "next/link"
import useTranslation from "next-translate/useTranslation"

import { H2, P } from "./Text"
import { StandardWidth } from "."

export function ErrorOccurred() {
  const { t } = useTranslation("error")
  return (
    <StandardWidth>
      <H2>{t("ErrorOccurred.somethingWentWrong")}</H2>
      <P>{t("ErrorOccurred.errorInfo")}</P>
      <P>
        <Link href="/">
          <a>{t("common:backHome")}</a>
        </Link>
      </P>
    </StandardWidth>
  )
}
