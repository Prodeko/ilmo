import React from "react";
import { AdminLayout, ButtonLink, ServerPaginatedTable } from "@app/components";
import { ListEventsDocument, Event, useSharedQuery } from "@app/graphql";
import {
  Button,
  Col,
  PageHeader,
  Popconfirm,
  Popover,
  Progress,
  Row,
  Space,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { reduce } from "lodash";
import { NextPage } from "next";
import Link from "next/link";
import useTranslation from "next-translate/useTranslation";

const AdminListEvents: NextPage = () => {
  const query = useSharedQuery();

  return (
    <AdminLayout href="/admin/event/list" query={query}>
      <AdminListEventsInner />
    </AdminLayout>
  );
};

const AdminListEventsInner: React.FC = () => {
  const { t, lang } = useTranslation("admin");
  const today = "2021-02-11" || dayjs().format("YYYY-MM-DD");

  const columns = [
    {
      title: "",
      dataIndex: ["name", lang],
      key: "name",
      render: (name: string, event: Event) => (
        <Space>
          <ButtonLink
            info
            as={`/admin/event/update/${event.id}`}
            href={{
              pathname: "/admin/event/update/[id]",
              query: {
                id: event.id,
              },
            }}
          >
            <a>{t("common:update")}</a>
          </ButtonLink>
          <Popconfirm
            cancelText={t("common:no")}
            okText={t("common:yes")}
            placement="top"
            title={t("events.delete.deleteEventConfirmText")}
          >
            <Button
              data-cy="admin-event-list-button-delete-event"
              style={{ marginLeft: 5 }}
              danger
            >
              {t("common:delete")}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
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
      title: t("events.list.registrations"),
      key: "registrations",
      render: (event: Event) => {
        const popoverContent = (
          <>
            {event.quotas.nodes.map((quota) => {
              const quotaRegistrations = quota.registrations.totalCount;
              return (
                <Row key={quota.id} style={{ minWidth: "20rem" }}>
                  <Col span={5}>{quota.title[lang]}</Col>
                  <Col span={12} style={{ marginRight: "10px" }}>
                    <Progress
                      percent={(quotaRegistrations * 100) / quota.size}
                      showInfo={false}
                    />
                  </Col>
                  <Col flex="auto" style={{ whiteSpace: "nowrap" }}>
                    {quotaRegistrations} / {quota.size}
                  </Col>
                </Row>
              );
            })}
          </>
        );

        const numRegistrations = event.registrations.totalCount;
        const totalSize = reduce(
          event.quotas.nodes,
          (acc: number, quota) => acc + quota.size,
          0
        );
        return (
          <Popover
            content={popoverContent}
            title={t("events.list.registrationsPerQuota")}
          >
            <Row gutter={12}>
              <Col span={6}>
                <Typography.Text style={{ whiteSpace: "nowrap" }}>
                  {numRegistrations} / {totalSize}
                </Typography.Text>
              </Col>
              <Col span={18}>
                <Progress
                  style={{ paddingLeft: "12px" }}
                  percent={(numRegistrations * 100) / totalSize}
                  showInfo={false}
                />
              </Col>
            </Row>
          </Popover>
        );
      },
    },
    {
      title: t("events:time"),
      dataIndex: "eventStartTime",
      render: (startTime: string) => dayjs(startTime).format("l LTS"),
    },
  ];

  return (
    <Row>
      <Col flex={1}>
        <PageHeader title={"Admin events"} />
        <ServerPaginatedTable
          columns={columns}
          data-cy="adminpage-category-open-events"
          dataField="events"
          queryDocument={ListEventsDocument}
          showPagination={true}
          size="middle"
          variables={{ today }}
        />
      </Col>
    </Row>
  );
};

export default AdminListEvents;
