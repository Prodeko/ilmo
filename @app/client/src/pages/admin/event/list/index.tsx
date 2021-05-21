import React from "react"
import {
  AdminLayout,
  AdminTableActions,
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
import { Badge, Col, Popover, Progress, Row, Tag, Typography } from "antd"
import dayjs from "dayjs"
import { reduce } from "lodash"
import { NextPage } from "next"
import Link from "next/link"
import useTranslation from "next-translate/useTranslation"

const Admin_ListEvents: NextPage = () => {
  const { t, lang } = useTranslation("admin")
  const query = useListEventsPageQuery()
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
          onFilter: (value: string | number | boolean, record: Event) =>
            record?.category?.name[lang].indexOf(value) === 0,
          sorter: (a: Event, b: Event) =>
            a?.name[lang]?.localeCompare(b?.name[lang] || ""),
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
          render: (event: Event) => {
            const popoverContent = (
              <>
                {event.quotas.nodes.map((quota) => {
                  const quotaRegistrations = quota.registrations.totalCount
                  return (
                    <Row key={quota.id} style={{ minWidth: "20rem" }}>
                      <Col span={5}>{quota.title[lang]}</Col>
                      <Col span={12} style={{ marginRight: "10px" }}>
                        <Progress
                          percent={(quotaRegistrations * 100) / quota.size}
                          showInfo={false}
                        />
                      </Col>
                      <Col flex="auto" style={{ whiteSpace: "nowrap" }}>
                        {quotaRegistrations} / {quota.size}
                      </Col>
                    </Row>
                  )
                })}
              </>
            )

            const numRegistrations = event.registrations.totalCount
            const totalSize = reduce(
              event.quotas.nodes,
              (acc: number, quota) => acc + quota.size,
              0
            )
            return (
              <Popover
                content={popoverContent}
                title={t("events.list.registrationsPerQuota")}
              >
                <Row gutter={12}>
                  <Col span={8}>
                    <Typography.Text style={{ whiteSpace: "nowrap" }}>
                      {numRegistrations} / {totalSize}
                    </Typography.Text>
                  </Col>
                  <Col span={12}>
                    <Progress
                      percent={(numRegistrations * 100) / totalSize}
                      showInfo={false}
                      style={{ marginLeft: "12px" }}
                    />
                  </Col>
                </Row>
              </Popover>
            )
          },
        },
        {
          title: t("events.list.registrationStartTime"),
          dataIndex: "registrationStartTime",
          render: (startTime: string) => dayjs(startTime).format("l LT"),
        },
        {
          title: t("events.list.eventStartTime"),
          dataIndex: "eventStartTime",
          render: (startTime: string) => dayjs(startTime).format("l LT"),
        },
      ]
    : [actionsColumn, nameColumn]

  return (
    <AdminLayout href="/admin/event/list" query={query}>
      <Row>
        <Col flex={1}>
          <H3>{t("home:events.signupsUpcomingEvents")}</H3>
          <ServerPaginatedTable
            columns={columns}
            data-cy="adminpage-events-upcoming"
            dataField="signupUpcomingEvents"
            queryDocument={ListEventsDocument}
            showPagination={true}
            size="middle"
          />
          <H3>{t("home:events.signupsOpenEvents")}</H3>
          <ServerPaginatedTable
            columns={columns}
            data-cy="adminpage-events-open"
            dataField="signupOpenEvents"
            queryDocument={ListEventsDocument}
            showPagination={true}
            size="middle"
          />
          <H3>{t("home:events.signupsClosedEvents")}</H3>
          <ServerPaginatedTable
            columns={columns}
            data-cy="adminpage-events-closed"
            dataField="signupClosedEvents"
            queryDocument={ListEventsDocument}
            showPagination={true}
            size="middle"
          />
        </Col>
      </Row>
    </AdminLayout>
  )
}

export default Admin_ListEvents
