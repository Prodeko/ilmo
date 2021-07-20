import { useCallback, useState } from "react"
import {
  Event,
  EventCategory,
  useDeleteEventCategoryMutation,
  useDeleteEventMutation,
} from "@app/graphql"
import * as Sentry from "@sentry/react"
import { Button, message, Popconfirm, Space } from "antd"
import useTranslation from "next-translate/useTranslation"

import { ButtonLink, ErrorAlert } from "."

interface AdminTableActionsProps {
  adminUrl: string
  bannerErrorText?: string
  dataType: Event | EventCategory
  deleteMutation:
    | typeof useDeleteEventMutation
    | typeof useDeleteEventCategoryMutation
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
  const [_res1, deleteDataType] = deleteMutation()
  const [error, setError] = useState<Error | null>(null)

  const doDelete = useCallback(async () => {
    try {
      await deleteDataType({
        id: dataType?.id,
      })
      message.info(t("notifications.deleteSuccess"))
    } catch (e) {
      Sentry.captureException(e)
      setError(e)
    }
  }, [deleteDataType, dataType, t])

  return (
    <>
      <Space>
        <ButtonLink
          as={`/admin/${adminUrl}/update/${dataType.id}`}
          href={`/admin/${adminUrl}/update/[id]`}
          type="primary"
        >
          <a>{t("common:update")}</a>
        </ButtonLink>
        <Popconfirm
          cancelText={t("common:no")}
          okText={t("common:yes")}
          placement="top"
          title={deleteConfirmTranslate}
          onConfirm={doDelete}
        >
          <Button
            data-cy="admin-table-delete-button"
            style={{ marginLeft: 5 }}
            danger
          >
            {t("common:delete")}
          </Button>
        </Popconfirm>
      </Space>
      {error ? (
        <ErrorAlert
          error={error}
          message={bannerErrorText ?? ""}
          setError={setError}
        />
      ) : null}
    </>
  )
}
