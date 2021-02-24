import React from "react";
import { EventCard, ServerPaginatedTable, SharedLayout } from "@app/components";
import { Event, HomePageEventsDocument, useHomePageQuery } from "@app/graphql";
import { Col, Divider, Empty, Grid, Row, Space, Tag, Typography } from "antd";
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

const gridTemplateColumn = {
  xs: "1, 1fr",
  sm: "2, 1fr",
  md: "2, 1fr",
  lg: "3, 1fr",
  xl: "4, 1fr",
  xxl: "4, 1fr",
};

const Home: NextPage = () => {
  const { t, lang } = useTranslation("home");

  const query = useHomePageQuery();
  const screens = useBreakpoint();
  const currentBreakPoint = Object.entries(screens)
    .filter((screen) => !!screen[1])
    .slice(-1)[0] || ["xs", true];
  const isMobile = screens["xs"];

  const homeGridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${gridTemplateColumn[currentBreakPoint[0]]})`,
    gridGap: 16,
  };

  // TODO: use eventCategories and organizations to
  // add filtering to the table. Might not be needed on the
  // frontpage but might be nice for admin.
  const eventCategories = query?.data?.eventCategories?.nodes;
  const organizations = query?.data?.organizations?.nodes;
  const signupsOpenEvents = query?.data?.signupOpenEvents?.nodes;
  const signupsUpcomingEvents = query?.data?.signupUpcomingEvents?.nodes;

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
          dataIndex: "eventEndTime",
          key: "eventEndTime",
          render: (eventEndTime: string) => dayjs(eventEndTime).format("l LT"),
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
            dayjs(eventStartTime).format("l LT"),
        },
      ];

  return (
    <SharedLayout query={query} title="">
      <Space direction="vertical">
        <Title level={3}>{t("events.signupsOpenEvents")}</Title>
        <div data-cy="homepage-signup-open-events" style={homeGridStyle}>
          {signupsOpenEvents?.length > 0 ? (
            signupsOpenEvents.map((event) => {
              return <EventCard key={event.id} event={event as Event} />;
            })
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>
        <Title level={3}>{t("events.signupsUpcomingEvents")}</Title>
        <div data-cy="homepage-signup-upcoming-events" style={homeGridStyle}>
          {signupsUpcomingEvents?.length > 0 ? (
            signupsUpcomingEvents?.map((event) => {
              return <EventCard key={event.id} event={event as Event} />;
            })
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
          <Divider dashed />
        </div>
        <Row>
          <Col xs={24}>
            <Title level={3}>{t("events.signupsClosedEvents")}</Title>
            <ServerPaginatedTable
              columns={columns}
              data-cy="homepage-signup-closed-events"
              dataField="signupClosedEvents"
              queryDocument={HomePageEventsDocument}
              showPagination={true}
              size="middle"
            />
          </Col>
        </Row>
      </Space>
    </SharedLayout>
  );
};

export default Home;
