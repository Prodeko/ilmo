import enUS from "antd/lib/locale/en_US"
import fiFI from "antd/lib/locale/fi_FI"
import { Locale } from "antd/lib/locale-provider"
import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import "dayjs/locale/fi"
import "dayjs/locale/en"

// Required for dayjs timezone features
// https://day.js.org/docs/en/plugin/timezone
dayjs.extend(utc)
dayjs.extend(timezone)

const locales = {
  en: ["en", enUS],
  fi: ["fi", fiFI],
}

export function setLocale(locale: string): Locale {
  const [localeString, antd] = locale ? locales[locale] : [locales["fi"]]
  dayjs.locale(localeString)
  return antd
}
