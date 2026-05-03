import { ReactCountryFlag } from "react-country-flag"
import { DownOutlined } from "@ant-design/icons"
import { Languages } from "@app/lib"
import { Dropdown } from "antd"
import { useRouter } from "next/router"

import { Loading, useTranslation } from "."

import type { MenuProps } from "antd"

interface LocaleMenuProps {
  menuTitle: string
  onClickHandler: NonNullable<MenuProps["onClick"]>
  includedLocales?: (Languages | string)[]
  dataCyDropdown: string
  dataCyMenuItem: string
  loading?: boolean
}

const localeMap = {
  fi: { name: "fi", flag: "FI" },
  en: { name: "en", flag: "GB" },
  se: { name: "sv", flag: "SE" },
} as const

export const LocaleMenu: React.FC<LocaleMenuProps> = ({
  menuTitle,
  onClickHandler,
  dataCyDropdown,
  dataCyMenuItem,
  loading,
  includedLocales = [],
}) => {
  const { t } = useTranslation("error")
  const { locales } = useRouter()

  const items: MenuProps["items"] = (locales ?? [])
    .map((locale) => {
      const entry = localeMap[locale as keyof typeof localeMap]
      if (!entry) return null
      const { name, flag } = entry
      if (!includedLocales.includes(name)) return null
      return {
        key: locale,
        disabled: loading,
        icon: (
          <ReactCountryFlag
            key={name}
            aria-label={`${name} flag`}
            countryCode={flag}
            style={{
              fontSize: "2rem",
              lineHeight: "2rem",
              marginRight: "12px",
            }}
          />
        ),
        label: (
          <span data-cy={`${dataCyMenuItem}-${name}`}>
            {t(`common:lang.${name}`)}
          </span>
        ),
      }
    })
    .filter(Boolean) as MenuProps["items"]

  return (
    <Dropdown
      disabled={loading || includedLocales.length === 0}
      menu={{ items, onClick: onClickHandler }}
      placement="bottomLeft"
      trigger={["click"]}
      arrow
    >
      <span data-cy={dataCyDropdown} style={{ whiteSpace: "nowrap" }}>
        <span style={{ marginLeft: 8, marginRight: 8 }}>{menuTitle}</span>
        {loading ? <Loading size="small" /> : <DownOutlined />}
      </span>
    </Dropdown>
  )
}
