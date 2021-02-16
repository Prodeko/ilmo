import * as qs from "querystring";

import React from "react";
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
  const { t, lang } = useTranslation("admin");

  const basicMenuItems = {
    main: {
      key: "/admin",
      title: t("adminMain"),
      target: "/admin",
    },
  };

  const items: MenuItem[] = query.loading
    ? [basicMenuItems.main]
    : [
        basicMenuItems.main,
        {
          key: "admin-menu-organizations",
          title: t("organizations"),
          target: [
            ...(query.data?.currentUser?.organizationMemberships.nodes.map(
              (organization): MenuItem => ({
                title: organization.organization?.name || "",
                key: `/o/${organization.organization?.slug}`,

                target: `/o/${organization.organization?.slug}`,
              })
            ) || []),
            {
              title: t("createNewOrganization"),
              titleProps: { strong: true },
              key: "/admin/create-organization",
              target: "/admin/create-organization",
            },
          ],
        },
        {
          key: "admin-menu-event-categories",
          title: t("eventCategories"),
          target: [
            ...(query.data?.currentUser?.organizationMemberships.nodes.map(
              (organization): MenuItem => ({
                title: organization.organization?.name || "",
                key: `event-category-${organization.organization?.slug}`,

                target: [
                  ...(organization.organization?.eventCategoriesByOwnerOrganizationId.nodes.map(
                    (category): MenuItem => ({
                      title: category.name[lang],
                      key: `/admin/category/${category.id}`,
                      target: `/admin/category/${category.id}`,
                    })
                  ) || []),
                  {
                    title: t("createNewCategory"),
                    titleProps: { strong: true },
                    key: `/admin/create-event-category${
                      organization.organization?.slug
                        ? `?org=${organization.organization.slug}`
                        : ""
                    }`,
                    target: `/admin/create-event-category${
                      organization.organization?.slug
                        ? `?org=${organization.organization.slug}`
                        : ""
                    }`,
                  },
                ],
              })
            ) || []),
            {
              title: t("createNewCategory"),
              titleProps: { strong: true },
              key: "/admin/create-event-category",
              target: "/admin/create-event-category",
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
      title={`${t("admin")}`}
      noPad
      query={query}
      forbidWhen={AuthRestrict.LOGGED_OUT}
    >
      {({ currentUser, error, loading }: SharedLayoutChildProps) =>
        !currentUser && !error && !loading ? (
          <Redirect href={`/login?next=${encodeURIComponent(fullHref)}`} />
        ) : (
          <Layout style={{ minHeight: contentMinHeight }} hasSider>
            <Sider>
              <SideMenu items={items} initialKey={href} />
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
