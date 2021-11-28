import { useCookies } from "react-cookie"
import { SupportedLanguages } from "@app/graphql"
import { useRouter } from "next/router"
import { MenuInfo } from "rc-menu/es/interface"

import { LocaleMenu, useTranslation } from "."

const NEXT_LOCALE_COOKIE_NAME = "NEXT_LOCALE"

export const LocaleSelect: React.FC = () => {
  const { t } = useTranslation("error")
  const [, setCookie] = useCookies([NEXT_LOCALE_COOKIE_NAME])
  const { push, pathname, query, asPath } = useRouter()

  function changeLocale(info: MenuInfo) {
    const locale = info.key
    setCookie(NEXT_LOCALE_COOKIE_NAME, locale, {
      path: "/",
      sameSite: true,
      secure: true,
    })
    push({ pathname, query }, asPath, { locale })
  }

  const includedLocales = Object.values(SupportedLanguages).map((l) =>
    l.toLowerCase()
  )

  return (
    <LocaleMenu
      dataCyDropdown="localeselect-dropdown"
      dataCyMenuItem="localeselect"
      includedLocales={includedLocales}
      menuTitle={t("common:language")}
      onClickHandler={changeLocale}
    />
  )
}
