import { memo, ReactNode } from "react"
import { arePropsEqual, isString } from "@app/lib"
import { Menu, Typography } from "antd"
import { useRouter } from "next/router"

import type { MenuProps } from "antd"
import type { TextProps } from "antd/lib/typography/Text"

const { Text } = Typography

export interface MenuItem {
  key: string
  target: string | null | MenuItem[]
  title: string
  showWarn?: boolean
  titleProps?: TextProps
  cy?: string
  icon?: ReactNode
}

const toAntdItem = (item: MenuItem): NonNullable<MenuProps["items"]>[number] => {
  const { titleProps, title, key, cy, icon, target } = item
  if (isString(target)) {
    return {
      key,
      icon,
      label: (
        <span data-cy={cy}>
          <Text {...titleProps}>{title}</Text>
        </span>
      ),
    }
  }
  return {
    key,
    icon,
    label: <span data-cy={cy}>{title}</span>,
    children: target?.map(toAntdItem),
  }
}

type AdminSideMenuProps = {
  items: MenuItem[]
}

export const AdminSideMenu: React.FC<AdminSideMenuProps> = memo(({ items }) => {
  const router = useRouter()
  return (
    <Menu
      items={items.map(toAntdItem)}
      mode="inline"
      style={{ height: "100%", zIndex: -1 }}
      onClick={({ key }) => router.push(key)}
    />
  )
}, arePropsEqual)
