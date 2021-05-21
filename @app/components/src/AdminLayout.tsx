import * as qs from "querystring"

import React from "react"
import PlusCircleTwoTone from "@ant-design/icons/PlusCircleTwoTone"
import { QueryResult } from "@apollo/client"
import { SharedLayout_QueryFragment } from "@app/graphql"
import { Layout } from "antd"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

import { AdminSideMenu, MenuItem } from "./AdminSideMenu"
import { Redirect } from "./Redirect"
import {
  AuthRestrict,
  SharedLayout,
  SharedLayoutChildProps,
} from "./SharedLayout"

const { Sider } = Layout

const findPage = (key: string, items: MenuItem[]): MenuItem | undefined => {
  if (items?.some((item) => item.key === key)) {
    return items.find((item) => item.key === key)
  }
  const itemsWithChildren = items?.filter(
    (item) =>
      typeof item.target !== "string" && typeof item.target !== "function"
  )
  for (let i = 0; i < itemsWithChildren?.length; i++) {
    const res = findPage(key, itemsWithChildren[i].target as MenuItem[])
    if (res) {
      return res
    }
  }
  return undefined
}

export interface AdminLayoutProps {
  query: Pick<
    QueryResult<SharedLayout_QueryFragment>,
    "data" | "loading" | "error" | "networkStatus" | "client" | "refetch"
  >
  href: string
  children: React.ReactNode
}

export function AdminLayout({
  query,
  href: inHref,
  children,
}: AdminLayoutProps) {
  const { t } = useTranslation("admin")
  const router = useRouter()

  const basicMenuItems = [
    {
      key: "/admin/emails",
      title: t("sider.titles.emails"),
      target: "/admin/emails",
    },
  ]

  const organizationMemberships =
    query.data?.currentUser?.organizationMemberships.nodes

  const items: MenuItem[] = query.loading
    ? [...basicMenuItems]
    : [
        {
          key: "admin-menu-organizations",
          title: t("sider.titles.organizations"),
          cy: "admin-sider-organizations",
          target: organizationMemberships
            ? [
                ...organizationMemberships?.map((organization): MenuItem => {
                  const title = organization.organization?.name || ""
                  const slug = organization.organization?.slug
                  return {
                    title,
                    key: `/admin/organization/${slug}`,
                    target: `/admin/organization/${slug}`,
                  }
                }),
                {
                  title: t("sider.titles.createOrganization"),
                  cy: "admin-sider-create-organization",
                  key: "/admin/organization/create",
                  target: "/admin/organization/create",
                  icon: <PlusCircleTwoTone twoToneColor="#52c41a" />,
                },
              ]
            : null,
        },
        {
          key: "admin-menu-events",
          title: t("sider.titles.events"),
          cy: "admin-sider-events",
          target: [
            {
              title: t("sider.titles.listEvents"),
              key: "/admin/event/list",
              target: "/admin/event/list",
            },
            {
              title: t("sider.titles.createEvent"),
              key: "/admin/event/create",
              target: "/admin/event/create",
              cy: "admin-sider-create-event",
              icon: <PlusCircleTwoTone twoToneColor="#52c41a" />,
            },
          ],
        },
        {
          key: "admin-menu-event-categories",
          title: t("sider.titles.eventCategories"),
          cy: "admin-sider-event-categories",
          target: [
            {
              title: t("sider.titles.listEventCategories"),
              key: "/admin/event-category/list",
              target: "/admin/event-category/list",
            },
            {
              title: t("sider.titles.createEventCategory"),
              key: "/admin/event-category/create",
              target: "/admin/event-category/create",
              cy: "admin-sider-create-event-category",
              icon: <PlusCircleTwoTone twoToneColor="#52c41a" />,
            },
          ],
        },
        ...basicMenuItems,
      ]

  const page = findPage(String(inHref), items) || items[0]
  const href = page.key

  const routerQuery = router?.query
  const fullHref = href + (routerQuery ? `?${qs.stringify(routerQuery)}` : "")

  const layoutSider = (
    <Sider breakpoint="md" collapsedWidth="0">
      <AdminSideMenu initialKey={href} items={items} />
    </Sider>
  )

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.NOT_ADMIN}
      query={query}
      sider={layoutSider}
      title={`${t("common:admin")}`}
    >
      {({ currentUser, error, loading }: SharedLayoutChildProps) =>
        !currentUser && !error && !loading ? (
          <Redirect href={`/login?next=${encodeURIComponent(fullHref)}`} />
        ) : (
          children
        )
      }
    </SharedLayout>
  )
}
