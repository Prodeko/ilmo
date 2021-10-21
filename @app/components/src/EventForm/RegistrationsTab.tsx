import {
  EventPage_QuestionFragment,
  ListEventRegistrationsDocument,
  Registration,
  RegistrationStatus,
} from "@app/graphql"
import { downloadRegistrations, Sorter } from "@app/lib"
import { Typography } from "antd"
import dayjs from "dayjs"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

import {
  EventRegistrationAnswersPopover,
  ServerPaginatedTable,
  useIsMobile,
} from "../."

import { RegistrationsTableActions } from "./RegistrationTableActions"

const { Text } = Typography

interface RegistrationsTabProps {
  eventSlug: string
  questions: EventPage_QuestionFragment[] | undefined
}

export const RegistrationsTab: React.FC<RegistrationsTabProps> = ({
  eventSlug,
  questions,
}) => {
  const router = useRouter()
  const { t } = useTranslation("events")
  const isMobile = useIsMobile()

  const commonColumns = [
    {
      title: "",
      key: "actions",
      ellipsis: true,
      render: (_value: string, row: Registration) => (
        <RegistrationsTableActions questions={questions} registration={row} />
      ),
    },
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
      title: t("common:email"),
      dataIndex: ["email"],
      key: "email",
      sorter: {
        compare: Sorter.TEXT,
      },
    },
  ]

  const columns = !isMobile
    ? [
        ...commonColumns,
        {
          title: t("events:queued"),
          dataIndex: ["status"],
          key: "status",
          ellipsis: true,
          render: (value: string) =>
            value === RegistrationStatus.InQueue ? (
              <Text type="danger">{t("common:yes")}</Text>
            ) : (
              <Text type="success">{t("common:no")}</Text>
            ),
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
    : commonColumns

  return (
    <ServerPaginatedTable
      columns={columns}
      data-cy="eventform-tab-registrations-table"
      dataField="registrations"
      downloadFilename={`${eventSlug}-registrations.csv`}
      downloadFunction={downloadRegistrations(questions)}
      queryDocument={ListEventRegistrationsDocument}
      size="small"
      variables={{ eventId: router.query.id }}
      showDownload
      showPagination
    />
  )
}
