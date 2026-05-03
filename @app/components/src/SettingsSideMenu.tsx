import { Menu, Typography } from "antd"

import { pages } from "./SettingsLayout"
import { Link, Warn } from "."

import type { User } from "@app/graphql"
import type { MenuProps } from "antd"

const { Text } = Typography

type SettingsSideMenuProps = {
  items: ReturnType<typeof pages>
  initialKey: string
  currentUser: User
}

export const SettingsSideMenu: React.FC<SettingsSideMenuProps> = ({
  currentUser,
  items,
  initialKey,
}) => {
  const menuItems: MenuProps["items"] = Object.keys(items).map((pageHref) => {
    const { cy, icon, warnIfUnverified, titleProps, title } = items[pageHref]
    return {
      key: pageHref,
      icon,
      label: (
        <Link data-cy={cy} href={pageHref}>
          <Warn
            okay={!currentUser || currentUser.isVerified || !warnIfUnverified}
          >
            <Text {...titleProps}>{title}</Text>
          </Warn>
        </Link>
      ),
    }
  })

  return (
    <Menu
      items={menuItems}
      mode="inline"
      selectedKeys={[initialKey]}
      style={{ height: "100%" }}
    />
  )
}
