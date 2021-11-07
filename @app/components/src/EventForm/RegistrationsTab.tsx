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

import {
  EventRegistrationAnswersPopover,
  ServerPaginatedTable,
  useIsMobile,
  useTranslation,
} from "../."

import { RegistrationsTableActions } from "./RegistrationsTableActions"

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
  const { t, lang } = useTranslation("events")
  const isMobile = useIsMobile()

  const commonColumns = [
    {
      title: "",
      key: "actions",
      width: !isMobile ? 160 : 1,
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
      title: t("events:quota"),
      dataIndex: ["quota", "title", lang],
      width: 80,
      key: "quota",
      sorter: {
        compare: Sorter.TEXT,
      },
    },
  ]

  const columns = !isMobile
    ? [
        ...commonColumns,
        {
          title: t("common:email"),
          dataIndex: ["email"],
          key: "email",
          ellipsis: true,
          sorter: {
            compare: Sorter.TEXT,
          },
        },
        {
          title: t("events:queued"),
          dataIndex: ["status"],
          key: "status",
          width: 80,
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
          render: (value: string) => dayjs(value).format("l LT ss.SSS"),
        },
        {
          title: t("common:updatedAt"),
          dataIndex: ["updatedAt"],
          key: "updatedAt",
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
      showSizeChanger
    />
  )
}
