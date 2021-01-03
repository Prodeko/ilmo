import React from "react";
// @ts-ignore
import ReactCountryFlag from "react-country-flag";
import { useRouter } from "next/router";

export function LocaleSelect() {
  const { locales, push, pathname, query, asPath } = useRouter();

  return (
    <>
      {locales?.map((locale) => (
        <ReactCountryFlag
          key={locale}
          data-cy={`localeselect-${locale}`}
          countryCode={locale === "en" ? "GB" : locale}
          aria-label={`${locale} flag`}
          style={{
            fontSize: "2rem",
            lineHeight: "2rem",
            marginRight: "12px",
          }}
          onClick={() => push({ pathname, query }, asPath, { locale })}
        />
      ))}
    </>
  );
}
