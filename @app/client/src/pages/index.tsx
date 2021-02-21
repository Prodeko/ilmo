import React from "react";
import { ServerPaginatedTable, SharedLayout } from "@app/components";
import { Event, HomePageEventsDocument, useHomePageQuery } from "@app/graphql";
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
  const query = useHomePageQuery();
  const screens = useBreakpoint();
  const isMobile = screens["xs"];

  // TODO: use eventCategories and organizations to
  // add filtering to the table. Might not be needed on the
  // frontpage but might be nice for admin.
  const eventCategories = query?.data?.eventCategories?.nodes;
  const organizations = query?.data?.organizations?.nodes;

  const columns = !isMobile
    ? [
        {
          title: t("events:eventName"),
          dataIndex: ["name", lang],
          key: "name",
          render: (name: string, event: Event) => (
            <Link
              as={`/event/${event.slug}`}
              href={{
                pathname: "/event/[slug]",
                query: {
                  slug: event.slug,
                },
              }}
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
            <Tag key={`${record.id}-${index}`} color={getColor(name)}>
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
            <Tag key={`${record.id}-${index}`} color={getColor(name)}>
              {name?.toUpperCase()}
            </Tag>
          ),
        },
        {
          title: t("events:time"),
          dataIndex: "eventStartTime",
          key: "eventStartTime",
          render: (eventStartTime: string) =>
            dayjs(eventStartTime).format("l LTS"),
        },
      ]
    : [
        {
          title: t("events:eventName"),
          dataIndex: ["name", lang],
          key: "name",
          render: (name: string, event: Event) => (
            <Link
              as={`/event/${event.slug}`}
              href={{
                pathname: "/event/[slug]",
                query: {
                  slug: event.slug,
                },
              }}
            >
              <a>{name}</a>
            </Link>
          ),
        },
        {
          title: t("events:time"),
          dataIndex: "eventStartTime",
          key: "eventStartTime",
          render: (eventStartTime: string) =>
            dayjs(eventStartTime).format("l LTS"),
        },
      ];

  const now = dayjs().format("YYYY-MM-DDTHH:mm");

  return (
    <SharedLayout query={query} title="">
      <Row gutter={32} justify="space-between">
        <Col xs={24}>
          <Title level={4}>{t("events.signupsOpenEvents")}</Title>
          <ServerPaginatedTable
            columns={columns}
            data-cy="homepage-signup-open-events"
            dataField="signupOpenEvents"
            queryDocument={HomePageEventsDocument}
            showPagination={false}
            size="middle"
            variables={{ now }}
          />
          <Divider dashed />
          <Title level={4}>{t("events.signupsClosedEvents")}</Title>
          <ServerPaginatedTable
            columns={columns}
            data-cy="homepage-signup-closed-events"
            dataField="signupClosedEvents"
            queryDocument={HomePageEventsDocument}
            showPagination={true}
            size="middle"
            variables={{ now }}
          />
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default Home;
