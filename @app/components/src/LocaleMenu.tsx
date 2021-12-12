import { ReactCountryFlag } from "react-country-flag"
import { DownOutlined } from "@ant-design/icons"
import { Languages } from "@app/lib"
import { Dropdown, Menu } from "antd"
import { useRouter } from "next/router"
import { MenuClickEventHandler } from "rc-menu/es/interface"

import { Loading, useTranslation } from "."

interface LocaleMenuProps {
  menuTitle: string
  onClickHandler: MenuClickEventHandler
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

  const menu = locales
    ?.map((locale) => {
      const { name, flag } = localeMap[locale]
      if (includedLocales.includes(name)) {
        return (
          <Menu.Item
            key={locale}
            data-cy={`${dataCyMenuItem}-${name}`}
            disabled={loading}
            icon={
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
            }
          >
            {t(`common:lang.${name}`)}
          </Menu.Item>
        )
      }
    })
    .filter(Boolean)

  return (
    <Dropdown
      disabled={loading || includedLocales.length === 0}
      overlay={<Menu onClick={onClickHandler}>{menu}</Menu>}
      placement="bottomLeft"
      arrow
    >
      <span data-cy={dataCyDropdown} style={{ whiteSpace: "nowrap" }}>
        <span style={{ marginLeft: 8, marginRight: 8 }}>{menuTitle}</span>
        {loading ? <Loading size="small" /> : <DownOutlined />}
      </span>
    </Dropdown>
  )
}
