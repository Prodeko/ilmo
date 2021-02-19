import React from "react";
import {
  AdminLayout,
  ButtonLink,
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
import {
  Col,
  Divider,
  PageHeader,
  Popover,
  Progress,
  Row,
  Typography,
} from "antd";
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
                      percent={
                        (quota.registrations.totalCount * 100) / quota.size
                      }
                      showInfo={false}
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
                  percent={(event.registrations.totalCount * 100) / totalSize}
                  showInfo={false}
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
            extra={[
              <ButtonLink
                key="update-category"
                as={`/admin/category/${id}/update`}
                data-cy="adminpage-category-update"
                href={`/admin/category/[id]/update`}
                type="primary"
              >
                {t("admin:update")}
              </ButtonLink>,
            ]}
            title={category.name[lang]}
          />
          <Typography.Text>{category.description[lang]}</Typography.Text>
          <Divider>{t("admin:events")}</Divider>
          <ServerPaginatedTable
            columns={columns}
            data-cy="adminpage-category-open-events"
            dataField="eventCategory.eventsByCategoryId"
            queryDocument={AdminCategoryEventsDocument}
            showPagination={true}
            size="middle"
            variables={{ today, id }}
          />
        </div>
      </Col>
    </Row>
  );
};

export default AdminCategoryPage;
