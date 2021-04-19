import React from "react";
import {
  AdminLayout,
  AdminTableActions,
  ServerPaginatedTable,
} from "@app/components";
import {
  EventCategory,
  ListEventCategoriesDocument,
  useDeleteEventCategoryMutation,
  useSharedQuery,
} from "@app/graphql";
import { Col, PageHeader, Row } from "antd";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";

const Admin_ListEventCategories: NextPage = () => {
  const query = useSharedQuery();

  return (
    <AdminLayout href="/admin/event-category/list" query={query}>
      <AdminListEventCategoriesInner />
    </AdminLayout>
  );
};

const AdminListEventCategoriesInner: React.FC = () => {
  const { t, lang } = useTranslation("admin");

  const columns = [
    {
      title: "",
      key: "actions",
      render: (_name: string, eventCategory: EventCategory) => {
        const bannerErrorText = (
          <span data-cy="eventcategory-delete-failed-bannertext">
            {t("eventCategories.delete.deleteFailedBADFK")}
          </span>
        );
        return (
          <AdminTableActions
            adminUrl="event-category"
            bannerErrorText={bannerErrorText}
            dataType={eventCategory}
            deleteConfirmTranslate={t("eventCategories.delete.confirmText")}
            deleteMutation={useDeleteEventCategoryMutation}
          />
        );
      },
    },
    {
      title: t("common:name"),
      dataIndex: ["name", lang],
      key: "name",
    },
    {
      title: t("common:description"),
      dataIndex: ["description", lang],
      key: "description",
      ellipsis: true,
    },
  ];

  return (
    <Row>
      <Col flex={1}>
        <PageHeader title={"Admin event categories"} />
        <ServerPaginatedTable
          columns={columns}
          data-cy="adminpage-eventcategories"
          dataField="eventCategories"
          queryDocument={ListEventCategoriesDocument}
          showPagination={true}
          size="middle"
        />
      </Col>
    </Row>
  );
};

export default Admin_ListEventCategories;
