// @ts-ignore
import ReactCountryFlag from "react-country-flag"
import { useRouter } from "next/router"

export function LocaleSelect() {
  const { locales, push, pathname, query, asPath } = useRouter()

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
          onClick={() => push({ pathname, query }, asPath, { locale })}
        />
      ))}
    </>
  )
}
