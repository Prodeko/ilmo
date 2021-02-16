import React from "react";
import {
  AdminLayout,
  ServerPaginatedTable,
  useAdminCategoryId,
  useAdminCategoryLoading,
} from "@app/components";
import {
  AdminCategory_EventCategoryFragment,
  AdminCategoryEventsDocument,
  Event,
  useAdminCategoryQuery,
} from "@app/graphql";
import { Col, PageHeader, Popover, Progress, Row, Typography } from "antd";
import dayjs from "dayjs";
import _ from "lodash";
import { NextPage } from "next";
import Link from "next/link";
import useTranslation from "next-translate/useTranslation";

const AdminCategoryPage: NextPage = () => {
  const id = useAdminCategoryId();
  const query = useAdminCategoryQuery({
    variables: { id },
  });
  const adminLoadingElement = useAdminCategoryLoading(query);
  const category = query?.data?.eventCategory;

  return (
    <AdminLayout href={`/admin/category/${id}`} query={query}>
      {adminLoadingElement || (
        <OrganizationPageInner category={category!} id={id} />
      )}
    </AdminLayout>
  );
};

interface AdminCategoryPageInnerProps {
  category: AdminCategory_EventCategoryFragment;
  id: string;
}

const OrganizationPageInner: React.FC<AdminCategoryPageInnerProps> = (
  props
) => {
  const { category, id } = props;
  const { t, lang } = useTranslation();
  const today = "2021-02-11" || dayjs().format("YYYY-MM-DD");

  const columns = [
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
      title: t("events:registrations"),
      key: "registrations",
      render: (event: Event) => {
        const popoverContent = (
          <>
            {event.quotas.nodes.map((quota) => {
              return (
                <Row key={quota.id} style={{ width: "20rem" }}>
                  <Col span={8}>{quota.title[lang]}</Col>
                  <Col span={12}>
                    <Progress
                      showInfo={false}
                      percent={
                        (quota.registrations.totalCount * 100) / quota.size
                      }
                    />
                  </Col>
                  <Col span={4}>
                    {quota.registrations.totalCount}/{quota.size}
                  </Col>
                </Row>
              );
            })}
          </>
        );
        const totalSize = _.reduce(
          event.quotas.nodes,
          (acc: number, quota) => acc + quota.size,
          0
        );
        return (
          <Popover
            content={popoverContent}
            title={t("events:registrationsPerQuote")}
          >
            <Row gutter={12}>
              <Col span={18}>
                <Progress
                  showInfo={false}
                  percent={(event.registrations.totalCount * 100) / totalSize}
                />
              </Col>
              <Col span={6}>
                <Typography.Text>{`${event.registrations.totalCount}/${totalSize}`}</Typography.Text>
              </Col>
            </Row>
          </Popover>
        );
      },
    },
    {
      title: t("events:time"),
      dataIndex: "startTime",
      render: (startTime: string) => dayjs(startTime).format("l LTS"),
    },
  ];

  return (
    <Row>
      <Col flex={1}>
        <div>
          <PageHeader
            title={category.name[lang]}
            /*extra={
              organization.currentUserIsOwner && [
                <ButtonLink
                  key="settings"
                  href={`/o/[slug]/settings`}
                  as={`/o/${organization.slug}/settings`}
                  type="primary"
                  data-cy="organizationpage-button-settings"
                >
                  Settings
                </ButtonLink>,
              ]
            }*/
          />
          <ServerPaginatedTable
            data-cy="homepage-signup-open-events"
            queryDocument={AdminCategoryEventsDocument}
            variables={{ today, id }}
            columns={columns}
            dataField="eventCategory.eventsByCategoryId"
            showPagination={true}
            size="middle"
          />
        </div>
      </Col>
    </Row>
  );
};

export default AdminCategoryPage;
