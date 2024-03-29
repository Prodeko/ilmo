import {
  AdminLayout,
  AdminTableActions,
  ServerPaginatedTable,
  useIsMobile,
  useTranslation,
} from "@app/components"
import {
  EventCategory,
  ListEventCategoriesDocument,
  useDeleteEventCategoryMutation,
  useSharedQuery,
} from "@app/graphql"
import { Sorter } from "@app/lib"
import { Col, PageHeader, Row, Tag } from "antd"
import { AlignType } from "rc-table/lib/interface"

import type { NextPage } from "next"

const Admin_ListEventCategories: NextPage = () => {
  const [query] = useSharedQuery()

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
    width: !isMobile ? 160 : 1,
    render: (_name: string, eventCategory: EventCategory) => {
      const bannerErrorText = t("eventCategories.delete.deleteFailedBADFK")
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
    width: 150,
    align: "center" as AlignType,
    sorter: {
      compare: Sorter.TEXT,
    },
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
          sorter: {
            compare: Sorter.TEXT,
          },
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
          size="middle"
          showPagination
        />
      </Col>
    </Row>
  )
}

export default Admin_ListEventCategories
