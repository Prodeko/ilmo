import { useCookies } from "react-cookie"
// @ts-ignore
import ReactCountryFlag from "react-country-flag"
import { useRouter } from "next/router"

export function LocaleSelect() {
  const [, setCookie] = useCookies(["NEXT_LOCALE"])
  const { locales, push, pathname, query, asPath } = useRouter()

  function changeLocale(locale: string) {
    setCookie("NEXT_LOCALE", locale, {
      path: "/",
      maxAge: 3600 * 60 * 60,
      sameSite: true,
      secure: true,
    })
    push({ pathname, query }, asPath, { locale })
  }

  return (
    <>
      {locales?.map((locale) => (
        <ReactCountryFlag
          key={locale}
          aria-label={`${locale} flag`}
          countryCode={locale === "en" ? "GB" : locale}
          data-cy={`localeselect-${locale}`}
          style={{
            fontSize: "2rem",
            lineHeight: "2rem",
            marginRight: "12px",
          }}
          onClick={() => changeLocale(locale)}
        />
      ))}
    </>
  )
}
