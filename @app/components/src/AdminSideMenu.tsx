import React, { Key, ReactNode, useState } from "react"
import { isString } from "@app/lib"
import { Menu, Typography } from "antd"

import { Link } from "."

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

const getMenuItem = (
  item: MenuItem,
  initialKey: Key
): [JSX.Element, string[]] => {
  const { titleProps, title, key, cy, icon, target } = item
  if (isString(target)) {
    const initialKeyPath = key === initialKey ? [initialKey] : []
    return [
      <Menu.Item key={key} data-cy={cy} icon={icon}>
        <Link href={target}>
          <Text {...titleProps}>{title}</Text>
        </Link>
      </Menu.Item>,
      initialKeyPath,
    ]
  }
  const children = target?.map((i) => getMenuItem(i, initialKey))
  const keyPath = children?.find((i) => i[1].length > 0)
  return [
    <SubMenu key={key} data-cy={cy} icon={icon} title={title}>
      {children?.map((a) => a[0])}
    </SubMenu>,
    keyPath ? keyPath[1].concat(key) : [],
  ]
}

type AdminSideMenuProps = {
  items: MenuItem[]
  initialKey: string
}

export const AdminSideMenu: React.FC<AdminSideMenuProps> = ({
  items,
  initialKey,
}) => {
  const [openKeys, setOpenKeys] = useState<string[]>([])

  const rootSubmenuKeys = items.map((item) => item.key)
  const menuItems = items.map((item) => getMenuItem(item, initialKey))
  const inner = menuItems.map((item) => item[0])

  const onOpenChange = (keys: string[]) => {
    const latestOpenKey = keys.find((key) => openKeys.indexOf(key) === -1)
    if (rootSubmenuKeys.indexOf(latestOpenKey!) === -1) {
      setOpenKeys(keys)
    } else {
      setOpenKeys(latestOpenKey ? [latestOpenKey] : [])
    }
  }

  return (
    <Menu
      mode="inline"
      openKeys={openKeys}
      selectedKeys={[initialKey]}
      style={{ height: "100%" }}
      // @ts-ignore
      onOpenChange={onOpenChange}
    >
      {inner}
    </Menu>
  )
}
