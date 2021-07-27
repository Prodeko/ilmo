import { Key, ReactNode, useState } from "react"
import { Menu, Typography } from "antd"
import SubMenu from "antd/lib/menu/SubMenu"
import { TextProps } from "antd/lib/typography/Text"
import Link from "next/link"

import { Warn } from "."

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

function isString(x: any): x is string {
  return typeof x === "string"
}

const getMenuItem = (
  item: MenuItem,
  initialKey: Key
): [JSX.Element, string[]] => {
  const { showWarn, titleProps, title, key, cy, icon, target } = item
  if (isString(target)) {
    const inner = (
      <a>
        <Warn okay={!showWarn}>
          <Text {...titleProps}>{title}</Text>
        </Warn>
      </a>
    )
    const initialKeyPath = key === initialKey ? [initialKey] : []
    return [
      <Menu.Item key={key} data-cy={cy} icon={icon}>
        <Link href={target}>{inner}</Link>
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

type MenuProps = {
  items: MenuItem[]
  initialKey: string
}

export const AdminSideMenu = ({ items, initialKey }: MenuProps) => {
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
      // @ts-ignore
      onOpenChange={onOpenChange}
    >
      {inner}
    </Menu>
  )
}
