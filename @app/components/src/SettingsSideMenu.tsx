import { Menu, Typography } from "antd"

import { pages } from "./SettingsLayout"
import { Link, Warn } from "."

import type { User } from "@app/graphql"

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
  return (
    <Menu mode="inline" selectedKeys={[initialKey]} style={{ height: "100%" }}>
      {Object.keys(items).map((pageHref) => {
        const { cy, icon, warnIfUnverified, titleProps, title } =
          items[pageHref]
        return (
          <Menu.Item key={pageHref} icon={icon}>
            <Link href={pageHref}>
              <a data-cy={cy}>
                <Warn
                  okay={
                    !currentUser || currentUser.isVerified || !warnIfUnverified
                  }
                >
                  <Text {...titleProps}>{title}</Text>
                </Warn>
              </a>
            </Link>
          </Menu.Item>
        )
      })}
    </Menu>
  )
}
