import { useCallback, useState } from "react"
import {
  EventPage_QuestionFragment,
  ListEventRegistrationsDocument,
  Registration,
  useDeleteEventRegistrationMutation,
} from "@app/graphql"
import { Sorter } from "@app/lib"
import * as Sentry from "@sentry/react"
import { Button, message, Popconfirm, Space, Typography } from "antd"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import {
  ButtonLink,
  ErrorAlert,
  EventRegistrationAnswersPopover,
  ServerPaginatedTable,
  useIsMobile,
} from "../."

const { Text } = Typography

export const RegistrationsTableActions: React.FC = () => {
  const { t } = useTranslation("admin")
  const [error, setError] = useState<Error | null>(null)
  const [, deleteRegistration] = useDeleteEventRegistrationMutation()

  const doDelete = useCallback(async () => {
    try {
      const { error } = await deleteRegistration({ updateToken: "test" })
      if (error) throw error
      message.info(t("notifications.deleteSuccess"))
    } catch (e) {
      Sentry.captureException(e)
      setError(e)
    }
  }, [deleteRegistration, t])

  return (
    <>
      <Space>
        <ButtonLink
          as={`/update-registration`}
          href="/update-registration/[updatetoken]"
          type="primary"
        >
          {t("common:update")}
        </ButtonLink>
        <Popconfirm
          cancelText={t("common:no")}
          okText={t("common:yes")}
          placement="top"
          title={t("registrations.delete.confirmText")}
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
          message={t("registrations.delete.deleteFailed")}
          setError={setError}
          banner
        />
      ) : null}
    </>
  )
}

interface RegistrationsTabProps {
  eventId: string
  questions: EventPage_QuestionFragment[] | undefined
}

export const RegistrationsTab: React.FC<RegistrationsTabProps> = ({
  eventId,
  questions,
}) => {
  const { t } = useTranslation("events")
  const isMobile = useIsMobile()

  const actionsColumn = {
    title: "",
    key: "actions",
    render: (_name: string) => {
      return <RegistrationsTableActions />
    },
  }

  const columns = !isMobile
    ? [
        actionsColumn,
        {
          title: t("common:name"),
          dataIndex: ["fullName"],
          key: "fullName",
          ellipsis: true,
          sorter: {
            compare: Sorter.TEXT,
          },
        },
        {
          title: t("events:queued"),
          dataIndex: ["isQueued"],
          key: "isQueued",
          ellipsis: true,
          render: (value: string) => {
            return value ? (
              <Text type="danger">{t("common:yes")}</Text>
            ) : (
              <Text type="success">{t("common:no")}</Text>
            )
          },
        },
        {
          title: t("common:answers"),
          dataIndex: ["answers"],
          key: "answers",
          ellipsis: true,
          render: (_value: string, row: Registration) => (
            <EventRegistrationAnswersPopover
              questions={questions}
              registration={row}
            />
          ),
        },
        {
          title: t("common:createdAt"),
          dataIndex: ["createdAt"],
          key: "createdAt",
          ellipsis: true,
          render: (value: string) => dayjs(value).format("l LT ss.SSS"),
        },
        {
          title: t("common:updatedAt"),
          dataIndex: ["updatedAt"],
          key: "updatedAt",
          ellipsis: true,
          render: (value: string, row: Registration) =>
            value !== row.createdAt
              ? dayjs(value).format("l LT ss.SSS")
              : t("common:no"),
        },
      ]
    : [actionsColumn]

  if (!eventId) return null

  return (
    <ServerPaginatedTable
      columns={columns}
      data-cy="eventform-tab-registrations-table"
      dataField="registrations"
      queryDocument={ListEventRegistrationsDocument}
      showPagination={true}
      size="middle"
      variables={{ eventId }}
    />
  )
}
