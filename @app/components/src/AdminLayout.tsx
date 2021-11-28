import qs from "querystring"

import { PlusCircleTwoTone } from "@ant-design/icons"
import { AiOutlineMail, AiOutlineTag } from "@hacknug/react-icons/ai"
import { FiUsers } from "@hacknug/react-icons/fi"
import { MdEvent } from "@hacknug/react-icons/md"
import { VscOrganization } from "@hacknug/react-icons/vsc"
import { Layout } from "antd"
import { useRouter } from "next/router"
import { UseQueryState } from "urql"

import { AdminSideMenu, MenuItem } from "./AdminSideMenu"
import { Redirect } from "./Redirect"
import {
  AuthRestrict,
  SharedLayout,
  SharedLayoutChildProps,
} from "./SharedLayout"
import { useTranslation } from "."

import type { SharedLayout_QueryFragment } from "@app/graphql"

const { Sider } = Layout

const findPage = (key: string, items: MenuItem[]): MenuItem | undefined => {
  const found = items.find((item) => item.key === key)
  if (found) {
    return found
  }
  const itemsWithChildren = items?.filter(({ target }) => Array.isArray(target))
  for (const item of itemsWithChildren) {
    const res = findPage(key, item.target as MenuItem[])
    if (res) {
      return res
    }
  }
  return undefined
}

interface AdminLayoutProps {
  query: UseQueryState<SharedLayout_QueryFragment>
  href: string
  children: React.ReactNode
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  query,
  href: inHref,
  children,
}) => {
  const { t } = useTranslation("admin")
  const router = useRouter()
  const { data, fetching } = query

  const basicMenuItems = [
    {
      key: "/admin/emails",
      title: t("sider.titles.emails"),
      icon: <AiOutlineMail />,
      target: "/admin/emails",
    },
  ]

  const organizationMemberships =
    data?.currentUser?.organizationMemberships.nodes || []

  const items: MenuItem[] = fetching
    ? [...basicMenuItems]
    : [
        {
          key: "admin-menu-organizations",
          title: t("sider.titles.organizations"),
          icon: <VscOrganization />,
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
          icon: <MdEvent />,
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
          icon: <AiOutlineTag />,
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
        {
          key: "/admin/users/list",
          title: t("sider.titles.users"),
          icon: <FiUsers />,
          target: "/admin/users/list",
          cy: "admin-sider-users",
        },
        ...basicMenuItems,
      ]

  const page = findPage(String(inHref), items) || items[0]
  const href = page.key

  const routerQuery = router?.query
  const fullHref = href + (routerQuery ? `?${qs.stringify(routerQuery)}` : "")

  const layoutSider = (
    <Sider breakpoint="md" collapsedWidth={40}>
      <AdminSideMenu initialKey={page.key} items={items} />
    </Sider>
  )

  return (
    <SharedLayout
      displayFooter={false}
      forbidWhen={AuthRestrict.NOT_ADMIN}
      query={query}
      sider={layoutSider}
      title={`${t("common:admin")}`}
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
