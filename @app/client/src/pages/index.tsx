import React from "react";
import { ServerPaginatedTable, SharedLayout } from "@app/components";
import {
  Event,
  HomePageDocument,
  useOrganizationsAndCategoriesQuery,
  useSharedQuery,
} from "@app/graphql";
import { Col, Divider, Grid, Row, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { NextPage } from "next";
import Link from "next/link";
import useTranslation from "next-translate/useTranslation";

const { Title } = Typography;
const { useBreakpoint } = Grid;

const getColor = (org: string) => {
  // TODO: Store this info in db?
  if (org === "Prodeko") {
    return "blue";
  } else if (org === "Pora") {
    return "black";
  } else {
    return "red";
  }
};

const Home: NextPage = () => {
  const { t, lang } = useTranslation("home");
  const query = useSharedQuery();
  const { data } = useOrganizationsAndCategoriesQuery();
  const screens = useBreakpoint();
  const isMobile = screens["xs"];

  // TODO: use eventCategories and organizations to
  // add filtering to the table. Might not be needed on the
  // frontpage but might be nice for admin.
  const eventCategories = data?.eventCategories?.nodes;
  const organizations = data?.organizations?.nodes;

  const columns = !isMobile
    ? [
        {
          title: t("events:eventName"),
          dataIndex: ["name", lang],
          key: "name",
          render: (name: string, event: Event) => (
            <Link
              href={{
                pathname: "/event/[slug]",
                query: {
                  slug: event.slug,
                },
              }}
              as={`/event/${event.slug}`}
            >
              <a>{name}</a>
            </Link>
          ),
        },
        {
          title: t("events:organizer"),
          dataIndex: ["ownerOrganization", "name"],
          key: "organizationName",
          filters: [
            ...Array.from(
              new Set(organizations?.map((o) => o.name))
            ).map((name) => ({ text: name, value: name })),
          ],
          onFilter: (value: string | number | boolean, record: Event) =>
            record?.ownerOrganization?.name.indexOf(value as string) === 0,
          sorter: (a: Event, b: Event) =>
            a?.ownerOrganization?.name?.localeCompare(
              b?.ownerOrganization?.name || ""
            ),
          render: (name: string, record: Event, index: number) => (
            <Tag color={getColor(name)} key={`${record.id}-${index}`}>
              {name?.toUpperCase()}
            </Tag>
          ),
        },
        {
          title: t("events:category"),
          dataIndex: ["category", "name", lang],
          key: "categoryName",
          filters: [
            ...Array.from(
              new Set(eventCategories?.map((o) => o.name[lang]))
            ).map((name) => ({ text: name, value: name })),
          ],
          onFilter: (value: string | number | boolean, record: Event) =>
            record?.category?.name[lang].indexOf(value) === 0,
          sorter: (a: Event, b: Event) =>
            a?.name[lang]?.localeCompare(b?.name[lang] || ""),
          render: (name: string, record: Event, index: number) => (
            <Tag color={getColor(name)} key={`${record.id}-${index}`}>
              {name?.toUpperCase()}
            </Tag>
          ),
        },
        {
          title: t("events:time"),
          dataIndex: "startTime",
          key: "startTime",
          render: (startTime: string) => dayjs(startTime).format("l LTS"),
        },
      ]
    : [
        {
          title: t("events:eventName"),
          dataIndex: ["name", lang],
          key: "name",
          render: (name: string, event: Event) => (
            <Link
              href={{
                pathname: "/event/[slug]",
                query: {
                  slug: event.slug,
                },
              }}
              as={`/event/${event.slug}`}
            >
              <a>{name}</a>
            </Link>
          ),
        },
        {
          title: t("events:time"),
          dataIndex: "startTime",
          key: "startTime",
          render: (startTime: string) => dayjs(startTime).format("l LTS"),
        },
      ];

  const now = dayjs().format("YYYY-MM-DDTHH:mm");

  return (
    <SharedLayout title="" query={query}>
      <Row justify="space-between" gutter={32}>
        <Col xs={24}>
          <Title level={4}>{t("events.signupsOpenEvents")}</Title>
          <ServerPaginatedTable
            data-cy="homepage-signup-open-events"
            queryDocument={HomePageDocument}
            variables={{ now }}
            columns={columns}
            dataField="signupOpenEvents"
            showPagination={false}
            size="middle"
          />
          <Divider dashed />
          <Title level={4}>{t("events.signupsClosedEvents")}</Title>
          <ServerPaginatedTable
            data-cy="homepage-signup-closed-events"
            queryDocument={HomePageDocument}
            variables={{ now }}
            columns={columns}
            dataField="signupClosedEvents"
            showPagination={true}
            size="middle"
          />
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default Home;
