import React from "react"
import {
  AdminLayout,
  AdminTableActions,
  ServerPaginatedTable,
  useIsMobile,
} from "@app/components"
import {
  EventCategory,
  ListEventCategoriesDocument,
  useDeleteEventCategoryMutation,
  useSharedQuery,
} from "@app/graphql"
import { Col, PageHeader, Row, Tag } from "antd"
import { NextPage } from "next"
import useTranslation from "next-translate/useTranslation"

const Admin_ListEventCategories: NextPage = () => {
  const query = useSharedQuery()

  return (
    <AdminLayout href="/admin/event-category/list" query={query}>
      <AdminListEventCategoriesInner />
    </AdminLayout>
  )
}

const AdminListEventCategoriesInner: React.FC = () => {
  const { t, lang } = useTranslation("admin")
  const isMobile = useIsMobile()

  const actionsColumn = {
    title: "",
    key: "actions",
    render: (_name: string, eventCategory: EventCategory) => {
      const bannerErrorText = (
        <span data-cy="eventcategory-delete-failed-bannertext">
          {t("eventCategories.delete.deleteFailedBADFK")}
        </span>
      )
      return (
        <AdminTableActions
          adminUrl="event-category"
          bannerErrorText={bannerErrorText}
          dataType={eventCategory}
          deleteConfirmTranslate={t("eventCategories.delete.confirmText")}
          deleteMutation={useDeleteEventCategoryMutation}
        />
      )
    },
  }

  const nameColumn = {
    title: t("common:name"),
    dataIndex: ["name", lang],
    key: "name",
    render: (name: string, record: EventCategory, index: number) => {
      return (
        <Tag key={`${record.id}-${index}`} color={record.color}>
          {name?.toUpperCase()}
        </Tag>
      )
    },
  }

  const columns = !isMobile
    ? [
        actionsColumn,
        nameColumn,
        {
          title: t("events:organizer"),
          dataIndex: ["ownerOrganization", "name"],
          key: "organizationName",
          ellipsis: true,
        },
        {
          title: t("common:description"),
          dataIndex: ["description", lang],
          key: "description",
          ellipsis: true,
        },
      ]
    : [actionsColumn, nameColumn]

  return (
    <Row>
      <Col flex={1}>
        <PageHeader title={t("pageTitle.listEventCategory")} />
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
  )
}

export default Admin_ListEventCategories
