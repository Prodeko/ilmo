import enUS from "antd/lib/locale/en_US"
import fiFI from "antd/lib/locale/fi_FI"
import svSE from "antd/lib/locale/sv_SE"
import { Locale } from "antd/lib/locale-provider"
import dayjs from "dayjs"
import localizedFormat from "dayjs/plugin/localizedFormat"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import "dayjs/locale/fi"
import "dayjs/locale/en"
import "dayjs/locale/sv-fi"

// Required for dayjs timezone features
// https://day.js.org/docs/en/plugin/timezone
dayjs.extend(utc)
dayjs.extend(timezone)
// Required for L/LL/LLL/LT format tokens used in EventCard, tables, etc.
dayjs.extend(localizedFormat)

const locales = {
  fi: ["fi", fiFI],
  en: ["en", enUS],
  se: ["se", svSE],
}

export function setLocale(locale: string): Locale {
  const [localeString, antd] = locale ? locales[locale] : [locales["fi"]]
  dayjs.locale(localeString)
  return antd
}
