import {
  AdminLayout,
  AdminTableActions,
  EventQuotaPopover,
  H3,
  ServerPaginatedTable,
  useIsMobile,
} from "@app/components"
import {
  Event,
  ListEventsDocument,
  useDeleteEventMutation,
  useListEventsPageQuery,
} from "@app/graphql"
import { Sorter } from "@app/lib"
import { Badge, Col, Popover, Row, Tag } from "antd"
import dayjs from "dayjs"
import { NextPage } from "next"
import Link from "next/link"
import useTranslation from "next-translate/useTranslation"

const Admin_ListEvents: NextPage = () => {
  const { t, lang } = useTranslation("admin")
  const [query] = useListEventsPageQuery()
  const isMobile = useIsMobile()

  const eventCategories = query?.data?.eventCategories?.nodes

  const actionsColumn = {
    title: "",
    key: "actions",
    render: (_name: string, event: Event) => {
      return (
        <AdminTableActions
          adminUrl="event"
          dataType={event}
          deleteConfirmTranslate={t("events.delete.confirmText")}
          deleteMutation={useDeleteEventMutation}
        />
      )
    },
  }
  const nameColumn = {
    title: t("common:name"),
    dataIndex: ["name", lang],
    key: "name",
    sorter: {
      compare: Sorter.TEXT,
    },
    render: (name: string, event: Event) => (
      <Link
        as={`/event/${event.slug}`}
        href={{
          pathname: "/event/[slug]",
          query: {
            slug: event.slug,
          },
        }}
      >
        <Popover content={t("events.list.linkToEvent")}>
          <a>{name}</a>
        </Popover>
      </Link>
    ),
  }
  const isDraftColumn = {
    title: t("events:forms.isDraft"),
    dataIndex: ["isDraft"],
    key: "isDraft",
    render: (isDraft: string) => (
      <Badge
        color={isDraft ? "yellow" : "green"}
        text={
          isDraft ? t("events:forms.isDraft") : t("events:forms.isNotDraft")
        }
      />
    ),
  }

  const columns = !isMobile
    ? [
        actionsColumn,
        isDraftColumn,
        nameColumn,
        {
          title: t("events:category"),
          dataIndex: ["category", "name", lang],
          key: "categoryName",
          filters: [
            ...Array.from(
              new Set(eventCategories?.map((o) => o.name[lang]))
            ).map((name) => ({ text: name, value: name })),
          ],
          sorter: {
            compare: Sorter.TEXT,
          },
          render: (name: string, record: Event, index: number) => {
            return (
              <Link
                as={`/admin/event-category/update/${record?.category?.id}`}
                href={{
                  pathname: "/admin/event-category/update/[id]",
                  query: {
                    id: record?.category?.id,
                  },
                }}
              >
                <Popover content={t("events.list.linkUpdateEventCategory")}>
                  <Tag
                    key={`${record.id}-${index}`}
                    color={record.category.color}
                    style={{ cursor: "pointer" }}
                  >
                    {name?.toUpperCase()}
                  </Tag>
                </Popover>
              </Link>
            )
          },
        },
        {
          title: t("events.list.registrations"),
          key: "registrations",
          render: (event: Event) => <EventQuotaPopover event={event} />,
        },
        {
          title: t("events.list.registrationStartTime"),
          dataIndex: "registrationStartTime",
          sorter: {
            compare: Sorter.DATE,
          },
          render: (startTime: string) => dayjs(startTime).format("l LT"),
        },
        {
          title: t("events.list.eventStartTime"),
          dataIndex: "eventStartTime",
          sorter: {
            compare: Sorter.DATE,
          },
          render: (startTime: string) => dayjs(startTime).format("l LT"),
        },
      ]
    : [actionsColumn, nameColumn]

  const tables = [
    {
      kind: "draft",
      translation: "common:draft",
      dataField: "draftEvents",
    },
    {
      kind: "upcoming",
      translation: "common:registrationUpcoming",
      dataField: "signupUpcomingEvents",
    },
    {
      kind: "open",
      translation: "common:registrationOpen",
      dataField: "signupOpenEvents",
    },
    {
      kind: "closed",
      translation: "common:registrationClosed",
      dataField: "signupClosedEvents",
    },
  ]

  return (
    <AdminLayout href="/admin/event/list" query={query}>
      <Row gutter={[0, 24]}>
        {tables.map(({ kind, translation, dataField }) => (
          <Col key={kind} span={24} style={{ paddingTop: 24 }}>
            <H3>{t(translation)}</H3>
            <ServerPaginatedTable
              columns={columns}
              data-cy={`adminpage-events-${kind}`}
              dataField={dataField}
              queryDocument={ListEventsDocument}
              showPagination={true}
              size="middle"
            />
          </Col>
        ))}
      </Row>
    </AdminLayout>
  )
}

export default Admin_ListEvents
