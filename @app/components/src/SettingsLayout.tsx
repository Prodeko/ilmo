import qs from "querystring"

import {
  LoginOutlined,
  MailOutlined,
  ProfileOutlined,
  TeamOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons"
import { Layout } from "antd"
import { useRouter } from "next/router"
import { Translate } from "next-translate"

import {
  AuthRestrict,
  SharedLayout,
  SharedLayoutChildProps,
  SharedLayoutProps,
} from "./SharedLayout"
import { Redirect, SettingsSideMenu, useTranslation } from "."

import type { User } from "@app/graphql"
import type { TextProps } from "antd/lib/typography/Text"

const { Sider } = Layout

interface SettingsPageSpec {
  title: string
  cy: string
  warnIfUnverified?: boolean
  titleProps?: TextProps
}

export const pages = (t: Translate) => ({
  "/settings/profile": {
    title: t("titles.index"),
    icon: <ProfileOutlined />,
    cy: "settingslayout-link-profile",
  } as SettingsPageSpec,
  "/settings/security": {
    title: t("titles.security"),
    icon: <LoginOutlined />,
    cy: "settingslayout-link-password",
  } as SettingsPageSpec,
  "/settings/accounts": {
    title: t("titles.accounts"),
    icon: <TeamOutlined />,
    cy: "settingslayout-link-accounts",
  } as SettingsPageSpec,
  "/settings/emails": {
    title: t("titles.emails"),
    warnIfUnverified: true,
    icon: <MailOutlined />,
    cy: "settingslayout-link-emails",
  } as SettingsPageSpec,
  "/settings/delete": {
    title: t("titles.delete"),
    titleProps: {
      type: "danger",
    },
    icon: <UserDeleteOutlined />,
    cy: "settingslayout-link-delete",
  } as SettingsPageSpec,
})

interface SettingsLayoutProps {
  query: SharedLayoutProps["query"]
  href: keyof ReturnType<typeof pages>
  children: React.ReactNode
}

export function SettingsLayout({ query, href, children }: SettingsLayoutProps) {
  const { t } = useTranslation("settings")
  const sideMenuItems = pages(t)
  const pageTitle = sideMenuItems[href].title
  const router = useRouter()
  const routerQuery = router?.query
  const fullHref = href + (routerQuery ? `?${qs.stringify(routerQuery)}` : "")

  const layoutSider = (
    <Sider breakpoint="md" collapsedWidth={40}>
      <SettingsSideMenu
        currentUser={query.data?.currentUser as User}
        initialKey={href}
        items={sideMenuItems}
      />
    </Sider>
  )
  return (
    <SharedLayout
      displayFooter={false}
      forbidWhen={AuthRestrict.LOGGED_OUT}
      query={query}
      sider={layoutSider}
      title={`${t("common:settings")}: ${pageTitle}`}
    >
      {({ currentUser, error, fetching }: SharedLayoutChildProps) =>
        !currentUser && !error && !fetching ? (
          <Redirect href={`/login?next=${encodeURIComponent(fullHref)}`} />
        ) : (
          children
        )
      }
    </SharedLayout>
  )
}
