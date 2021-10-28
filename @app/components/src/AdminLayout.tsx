import qs from "querystring"

import { PlusCircleTwoTone } from "@ant-design/icons"
import { AiOutlineMail } from "@react-icons/all-files/ai/AiOutlineMail"
import { AiOutlineTag } from "@react-icons/all-files/ai/AiOutlineTag"
import { MdEvent } from "@react-icons/all-files/md/MdEvent"
import { VscOrganization } from "@react-icons/all-files/vsc/VscOrganization"
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
  const foundItem = items.find((item) => item.key === key)
  if (foundItem) {
    return foundItem
  }
  const itemsWithChildren = items?.filter(
    ({ target }) => typeof target !== "string" && typeof target !== "function"
  )
  for (let i = 0; i < itemsWithChildren?.length; i++) {
    const res = findPage(key, itemsWithChildren[i].target as MenuItem[])
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
        ...basicMenuItems,
      ]

  const page = findPage(String(inHref), items) || items[0]
  const href = page.key

  const routerQuery = router?.query
  const fullHref = href + (routerQuery ? `?${qs.stringify(routerQuery)}` : "")

  const layoutSider = (
    <Sider breakpoint="md" collapsedWidth={40}>
      <AdminSideMenu initialKey={href} items={items} />
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
