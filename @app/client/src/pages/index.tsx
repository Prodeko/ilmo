import React from "react";
import { ServerPaginatedTable, SharedLayout } from "@app/components";
import {
  HomePageDocument,
  useOrganizationsAndCategoriesQuery,
  useSharedQuery,
} from "@app/graphql";
import { Col, Divider, Row, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";

const { Title } = Typography;

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
  const { t } = useTranslation("home");
  const query = useSharedQuery();
  const { data } = useOrganizationsAndCategoriesQuery();
  // TODO: use eventCategories and organizations to
  // add filtering to the table. Might not be needed on the
  // frontpage but might be nice for admin.
  const eventCategories = data?.eventCategories?.nodes;
  const organizations = data?.organizations?.nodes;

  const columns = [
    {
      title: t("events:eventName"),
      dataIndex: "name",
      key: "name",
      render: (name: string, event: { id: string }) => (
        <a href={`/event/${event.id}`}>{name}</a>
      ),
    },
    {
      title: t("events:organizer"),
      dataIndex: ["ownerOrganization", "name"],
      key: "organizationName",
      filters: organizations?.map((o) => ({ text: o.name, value: o.id })),
      render: (name: string) => (
        <Tag color={getColor(name)} key={name}>
          {name?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t("events:category"),
      dataIndex: ["category", "name"],
      key: "categoryName",
      filters: eventCategories?.map((c) => ({ text: c.name, value: c.id })),
      render: (name: string) => (
        <Tag color={getColor(name)} key={name}>
          {name?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t("events:time"),
      dataIndex: "startTime",
      key: "startTime",
    },
  ];

  const now = dayjs().format("YYYY-MM-DDTHH:mm");

  return (
    <SharedLayout title="" query={query}>
      <Row justify="space-between" gutter={32}>
        <Col xs={24}>
          <Title data-cy="homepage-header">Ilmokilke 3.0</Title>
          <Title level={4}>{t("events.signupsOpenEvents")}</Title>
          <ServerPaginatedTable
            queryDocument={HomePageDocument}
            variables={{ now }}
            columns={columns}
            fieldName="signupOpenEvents"
            showPagination={false}
          />
          <Divider dashed />
          <Title level={4}>{t("events.signupsClosedEvents")}</Title>
          <ServerPaginatedTable
            queryDocument={HomePageDocument}
            variables={{ now }}
            columns={columns}
            fieldName="signupClosedEvents"
            showPagination={true}
          />
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default Home;
