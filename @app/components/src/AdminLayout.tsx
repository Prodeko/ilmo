import * as qs from "querystring";

import React, { useState } from "react";
import { QueryResult } from "@apollo/client";
import { AdminLayout_QueryFragment } from "@app/graphql";
import { Layout } from "antd";
import _ from "lodash";
import { NextRouter, useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

import { Redirect } from "./Redirect";
import {
  AuthRestrict,
  contentMinHeight,
  SharedLayout,
  SharedLayoutChildProps,
} from "./SharedLayout";
import { MenuItem, SideMenu } from "./SideMenu";
import { StandardWidth } from "./StandardWidth";

const { Sider, Content } = Layout;

const findPage = (key: string, items: MenuItem[]): MenuItem | undefined => {
  if (items.some((item) => item.key === key)) {
    return items.find((item) => item.key === key);
  }
  const itemsWithChildren = items.filter(
    (item) =>
      typeof item.target !== "string" && typeof item.target !== "function"
  );
  for (let i = 0; i < itemsWithChildren.length; i++) {
    const res = findPage(key, itemsWithChildren[i].target as MenuItem[]);
    if (res) {
      return res;
    }
  }
  return undefined;
};

export interface AdminLayoutProps {
  query: Pick<
    QueryResult<AdminLayout_QueryFragment>,
    "data" | "loading" | "error" | "networkStatus" | "client" | "refetch"
  >;
  href: string;
  children: React.ReactNode;
}

export function AdminLayout({
  query,
  href: inHref,
  children,
}: AdminLayoutProps) {
  const { t } = useTranslation("admin");
  const [siderCollapsed, setSiderCollapsed] = useState(false);

  const basicMenuItems = [
    {
      key: "/admin",
      title: t("sider.titles.main"),
      target: "/admin",
    },
    {
      key: "/admin/emails",
      title: t("sider.titles.emails"),
      target: "/admin/emails",
    },
  ];

  const organizationMemberships =
    query.data?.currentUser?.organizationMemberships.nodes;

  const items: MenuItem[] = query.loading
    ? [...basicMenuItems]
    : [
        ...basicMenuItems,
        {
          key: "admin-menu-organizations",
          title: t("sider.titles.organizations"),
          target: organizationMemberships
            ? [
                ...organizationMemberships?.map(
                  (organization): MenuItem => {
                    const title = organization.organization?.name || "";
                    const slug = organization.organization?.slug;
                    return {
                      title,
                      key: `/admin/organizations/${slug}`,
                      target: `/admin/organizations/${slug}`,
                    };
                  }
                ),
                {
                  title: t("sider.titles.createOrganization"),
                  key: `/admin/create-organization`,
                  target: `/admin/create-organization`,
                },
              ]
            : null,
        },
        {
          key: "admin-menu-events",
          title: t("sider.titles.events"),
          target: [
            {
              title: t("sider.titles.listEvents"),
              key: `/admin/list-events`,
              target: `/admin/list-event`,
            },
            {
              title: t("sider.titles.createEvent"),
              key: `/admin/create-event`,
              target: `/admin/create-event`,
            },
          ],
        },
      ];

  const page = findPage(String(inHref), items) || items[0];
  const href = page.key;

  // `useRouter()` sometimes returns null
  const router: NextRouter | null = useRouter();
  const fullHref =
    href + (router && router.query ? `?${qs.stringify(router.query)}` : "");

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_OUT}
      query={query}
      title={`${t("admin")}`}
      noPad
    >
      {({ currentUser, error, loading }: SharedLayoutChildProps) =>
        !currentUser && !error && !loading ? (
          <Redirect href={`/login?next=${encodeURIComponent(fullHref)}`} />
        ) : (
          <Layout style={{ minHeight: contentMinHeight }} hasSider>
            <Sider
              collapsed={siderCollapsed}
              collapsible
              onCollapse={(collapsed) => setSiderCollapsed(collapsed)}
            >
              <SideMenu initialKey={href} items={items} />
            </Sider>
            <Content>
              <StandardWidth>{children}</StandardWidth>
            </Content>
          </Layout>
        )
      }
    </SharedLayout>
  );
}
