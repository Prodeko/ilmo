import * as qs from "querystring"

import React from "react"
import { AiOutlineMail, AiOutlineTag } from "react-icons/ai"
import { MdEvent } from "react-icons/md"
import { VscOrganization } from "react-icons/vsc"
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
      icon: <AiOutlineMail className="anticon" />,
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
          icon: <VscOrganization className="anticon" />,
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
                  key: "/admin/organization/create",
                  title: t("sider.titles.createOrganization"),
                  icon: <PlusCircleTwoTone twoToneColor="#52c41a" />,
                  target: "/admin/organization/create",
                  cy: "admin-sider-create-organization",
                },
              ]
            : null,
        },
        {
          key: "admin-menu-events",
          title: t("sider.titles.events"),
          icon: <MdEvent className="anticon" />,
          cy: "admin-sider-events",
          target: [
            {
              key: "/admin/event/list",
              title: t("sider.titles.listEvents"),
              target: "/admin/event/list",
            },
            {
              key: "/admin/event/create",
              title: t("sider.titles.createEvent"),
              icon: <PlusCircleTwoTone twoToneColor="#52c41a" />,
              target: "/admin/event/create",
              cy: "admin-sider-create-event",
            },
          ],
        },
        {
          key: "admin-menu-event-categories",
          title: t("sider.titles.eventCategories"),
          icon: <AiOutlineTag className="anticon" />,
          cy: "admin-sider-event-categories",
          target: [
            {
              key: "/admin/event-category/list",
              title: t("sider.titles.listEventCategories"),
              target: "/admin/event-category/list",
            },
            {
              key: "/admin/event-category/create",
              title: t("sider.titles.createEventCategory"),
              icon: <PlusCircleTwoTone twoToneColor="#52c41a" />,
              target: "/admin/event-category/create",
              cy: "admin-sider-create-event-category",
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
