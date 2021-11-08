import { useCallback } from "react"
import {
  AdminLayout,
  AdminTableActions,
  ServerPaginatedTable,
  useIsMobile,
  useTranslation,
} from "@app/components"
import {
  AdminListUsersDocument,
  SharedLayout_UserFragment,
  useAdminDeleteUserMutation,
  User,
  useSetAdminStatusMutation,
  useSharedQuery,
} from "@app/graphql"
import { Sorter } from "@app/lib"
import { Col, message, PageHeader, Row, Switch, Typography } from "antd"
import dayjs from "dayjs"

import type { NextPage } from "next"

const { Text } = Typography

const Admin_ListUsers: NextPage = () => {
  const [query] = useSharedQuery()

  return (
    <AdminLayout href="/admin/event-category/list" query={query}>
      <AdminListUserInner currentUser={query.data?.currentUser} />
    </AdminLayout>
  )
}
interface AdminListUserInnerProps {
  currentUser: SharedLayout_UserFragment | undefined
}
const AdminListUserInner: React.FC<AdminListUserInnerProps> = ({
  currentUser,
}) => {
  const { t } = useTranslation("admin")
  const isMobile = useIsMobile()
  const [, setAdminStatus] = useSetAdminStatusMutation()

  const onAdminStatusChange = useCallback(
    async (isAdmin, id) => {
      const { data, error } = await setAdminStatus({ input: { id, isAdmin } })
      if (data.setAdminStatus?.success) {
        message.success({
          key: "admin-status-updated",
          content: t("users.adminStatusUpdated"),
        })
      }
      if (error) {
        message.error({
          key: "admin-status-update-failed",
          content: t("users.errors.adminStatusFailed") + error.message,
        })
      }
    },
    [setAdminStatus, t]
  )

  const actionsColumn = {
    title: "",
    key: "actions",
    width: !isMobile ? 160 : 1,
    render: (_name: string, user: User) => (
      <AdminTableActions
        adminUrl="users"
        dataType={user}
        deleteConfirmTranslate={t("users.delete.confirmText")}
        deleteMutation={useAdminDeleteUserMutation}
      />
    ),
  }

  const nameColumn = {
    title: t("common:name"),
    dataIndex: ["name"],
    key: "name",
    sorter: {
      compare: Sorter.TEXT,
    },
  }

  const switchAdminStatusColumn = {
    title: t("admin:users.isAdminUser"),
    dataIndex: ["isAdmin"],
    render: (value: boolean, user: User) =>
      user.id !== currentUser?.id ? (
        <Switch
          data-cy={`admin-users-switch-is-admin-${user?.username}`}
          defaultChecked={value}
          onChange={(val) => onAdminStatusChange(val, user?.id)}
        />
      ) : null,
  }

  const columns = !isMobile
    ? [
        actionsColumn,
        switchAdminStatusColumn,
        nameColumn,
        {
          title: t("common:username"),
          dataIndex: ["username"],
          key: "username",
          ellipsis: true,
          sorter: {
            compare: Sorter.TEXT,
          },
        },
        {
          title: t("admin:users.emailVerified"),
          dataIndex: ["isVerified"],
          key: "isVerified",
          render: (value: string) =>
            value ? (
              <Text type="success">{t("common:yes")}</Text>
            ) : (
              <Text type="danger">{t("common:no")}</Text>
            ),
        },
        {
          title: t("admin:users.isAdminUser"),
          dataIndex: ["isAdmin"],
          key: "isAdmin",
          render: (value: string) =>
            value ? (
              <Text type="success">{t("common:yes")}</Text>
            ) : (
              <Text type="danger">{t("common:no")}</Text>
            ),
        },
        {
          title: t("common:createdAt"),
          dataIndex: "createdAt",
          sorter: {
            compare: Sorter.DATE,
          },
          render: (startTime: string) => dayjs(startTime).format("l LT"),
        },
      ]
    : [actionsColumn, switchAdminStatusColumn, nameColumn]

  return (
    <Row>
      <Col flex={1}>
        <PageHeader title={t("pageTitle.listUsers")} />
        <ServerPaginatedTable
          columns={columns}
          data-cy="adminpage-users"
          dataField="adminListUsers"
          queryDocument={AdminListUsersDocument}
          size="middle"
          showPagination
        />
      </Col>
    </Row>
  )
}

export default Admin_ListUsers
