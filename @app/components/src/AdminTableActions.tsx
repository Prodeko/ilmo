import React, { useCallback, useState } from "react"
import { ApolloCache } from "@apollo/client"
import {
  Event,
  EventCategory,
  useDeleteEventCategoryMutation,
  useDeleteEventMutation,
} from "@app/graphql"
import * as Sentry from "@sentry/react"
import { Button, message, Popconfirm, Space } from "antd"
import useTranslation from "next-translate/useTranslation"

import { ButtonLink, ErrorBanner } from "."

interface AdminTableActionsProps {
  adminUrl: string
  bannerErrorText?: JSX.Element
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
  const [deleteDataType] = deleteMutation({
    update(cache: ApolloCache<any>) {
      // Update Apollo cache after the delete mutation. Mutations don't
      // automatically update the cache. More information:
      // https://www.apollographql.com/docs/react/data/mutations/#making-all-other-cache-updates
      const normalizedId = cache.identify({
        id: dataType?.id,
        __typename: dataType.__typename,
      })
      cache.evict({ id: normalizedId })
      cache.gc()
    },
  })
  const [error, setError] = useState<Error | null>(null)

  const doDelete = useCallback(async () => {
    try {
      await deleteDataType({
        variables: { id: dataType?.id },
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
        <ErrorBanner error={error} setError={setError}>
          {bannerErrorText}
        </ErrorBanner>
      ) : null}
    </>
  )
}
