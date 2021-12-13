import { memo, ReactNode } from "react"
import { arePropsEqual, isString } from "@app/lib"
import { Menu, Typography } from "antd"
import { useRouter } from "next/router"

import type { TextProps } from "antd/lib/typography/Text"

const { Text } = Typography
const { SubMenu } = Menu

export interface MenuItem {
  key: string
  target: string | null | MenuItem[]
  title: string
  showWarn?: boolean
  titleProps?: TextProps
  cy?: string
  icon?: ReactNode
}

const getMenuItem = (item: MenuItem): JSX.Element => {
  const { titleProps, title, key, cy, icon, target } = item
  if (isString(target)) {
    return (
      <Menu.Item key={key} data-cy={cy} icon={icon}>
        <Text {...titleProps}>{title}</Text>
      </Menu.Item>
    )
  }
  const children = target?.map((i) => getMenuItem(i))
  return (
    <SubMenu key={key} data-cy={cy} icon={icon} title={title}>
      {children}
    </SubMenu>
  )
}

type AdminSideMenuProps = {
  items: MenuItem[]
}

export const AdminSideMenu: React.FC<AdminSideMenuProps> = memo(({ items }) => {
  const router = useRouter()
  const menuItems = items.map((item) => getMenuItem(item))

  return (
    <Menu
      mode="inline"
      motion={undefined}
      style={{ height: "100%", zIndex: -1 }}
      onClick={({ key }) => router.push(key)}
    >
      {menuItems}
    </Menu>
  )
}, arePropsEqual)
