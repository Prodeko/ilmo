import { useCallback, useState } from "react"
import {
  Event,
  EventCategory,
  useAdminDeleteUserMutation,
  useDeleteEventCategoryMutation,
  useDeleteEventMutation,
  User,
} from "@app/graphql"
import { Button, Col, message, Popconfirm, Row } from "antd"

import { ButtonLink, ErrorAlert, useTranslation } from "."

interface AdminTableActionsProps {
  adminUrl: string
  bannerErrorText?: string
  dataType: Event | EventCategory | User
  deleteMutation:
    | typeof useDeleteEventMutation
    | typeof useDeleteEventCategoryMutation
    | typeof useAdminDeleteUserMutation
  deleteConfirmTranslate: string
}

export const AdminTableActions: React.FC<AdminTableActionsProps> = ({
  adminUrl,
  bannerErrorText,
  dataType,
  deleteMutation,
  deleteConfirmTranslate,
}) => {
  const { t } = useTranslation("admin")
  const [, deleteDataType] = deleteMutation()
  const [error, setError] = useState<Error | null>(null)

  const doDelete = useCallback(async () => {
    try {
      const { error } = await deleteDataType({
        id: dataType?.id,
      })
      if (error) throw error
      message.info(t("notifications.deleteSuccess"))
    } catch (e) {
      setError(e)
    }
  }, [deleteDataType, dataType, t])

  return (
    <>
      <Row gutter={[8, 8]} wrap>
        <Col flex="none">
          <ButtonLink
            as={`/admin/${adminUrl}/update/${dataType.id}`}
            href={`/admin/${adminUrl}/update/[id]`}
            size="small"
            style={{ width: "65px" }}
            type="primary"
          >
            {t("common:update")}
          </ButtonLink>
        </Col>
        <Col flex="auto">
          <Popconfirm
            cancelText={t("common:no")}
            okText={t("common:yes")}
            placement="top"
            title={deleteConfirmTranslate}
            onConfirm={doDelete}
          >
            <Button
              data-cy="admin-table-delete-button"
              size="small"
              style={{ width: "65px" }}
              danger
            >
              {t("common:delete")}
            </Button>
          </Popconfirm>
        </Col>
      </Row>
      {error ? (
        <ErrorAlert
          error={error}
          message={bannerErrorText ?? ""}
          setError={setError}
          banner
        />
      ) : null}
    </>
  )
}
