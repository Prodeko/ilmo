import {
  containerTransitions,
  EventCard,
  EventQuotaPopover,
  H3,
  itemTransitionUp,
  Link,
  ServerPaginatedTable,
  SharedLayout,
  useBreakpoint,
  useIsMobile,
  useTranslation,
} from "@app/components"
import { Event, HomePageEventsDocument, useHomePageQuery } from "@app/graphql"
import { Sorter } from "@app/lib"
import { Col, Divider, Empty, Space, Tag } from "antd"
import dayjs from "dayjs"
import { AnimatePresence, m } from "framer-motion"

import type { NextPage } from "next"

const gridTemplateColumns = {
  xs: "1, minmax(0, 1fr)",
  sm: "2, minmax(0, 1fr)",
  md: "2, minmax(0, 1fr)",
  lg: "3, minmax(0, 1fr)",
  xl: "3, minmax(0, 1fr)",
  xxl: "4, minmax(0, 1fr)",
}

const Home: NextPage = () => {
  const { t } = useTranslation("home")

  const [query] = useHomePageQuery()
  const screens = useBreakpoint()
  const currentBreakPoint = Object.entries(screens)
    .filter((screen) => !!screen[1])
    .slice(-1)[0] || ["xs", true]
  const gridCols = gridTemplateColumns[currentBreakPoint[0]]

  const homeGridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${gridCols})`,
    gridAutoRows: "1fr",
    gridGap: 10,
  } as React.CSSProperties
  const signupsOpenEvents = query?.data?.signupOpenEvents?.nodes
  const signupsUpcomingEvents = query?.data?.signupUpcomingEvents?.nodes

  function renderEvents(type: string) {
    const title = (() => {
      switch (type) {
        case "open":
          return t("common:registrationOpen")
        case "upcoming":
          return t("common:registrationUpcoming")
        default:
          return
      }
    })()
    const events = (() => {
      switch (type) {
        case "open":
          return signupsOpenEvents
        case "upcoming":
          return signupsUpcomingEvents
        default:
          return
      }
    })()

    return (
      <>
        <H3>{title}</H3>
        {events?.length > 0 ? (
          <AnimatePresence>
            <m.section
              animate="enter"
              data-cy={`homepage-signup-${type}-events`}
              exit="exit"
              initial="initial"
              style={homeGridStyle}
              variants={containerTransitions}
            >
              {events.map((event) => (
                <m.div key={event.id} variants={itemTransitionUp}>
                  <EventCard key={event.id} event={event as Event} />
                </m.div>
              ))}
            </m.section>
          </AnimatePresence>
        ) : (
          <Empty
            description={<span>{t("noEvents")}</span>}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </>
    )
  }

  return (
    <SharedLayout query={query} title="">
      <Space direction="vertical" style={{ width: "100%" }}>
        {renderEvents("open")}
        {renderEvents("upcoming")}
        <Divider dashed />
        <Col xs={24}>
          <Home_SignupClosedEvents />
        </Col>
      </Space>
    </SharedLayout>
  )
}

const Home_SignupClosedEvents = () => {
  const { t, lang } = useTranslation("home")

  const [query] = useHomePageQuery()
  const isMobile = useIsMobile()

  const eventCategories = query?.data?.eventCategories?.nodes
  const organizations = query?.data?.organizations?.nodes

  const nameColumn = {
    title: t("events:eventName"),
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
        <a>{name}</a>
      </Link>
    ),
  }

  const endTimeColumn = {
    title: t("events:endTime"),
    dataIndex: "eventEndTime",
    key: "eventEndTime",
    sorter: {
      compare: Sorter.DATE,
    },
    render: (eventEndTime: string) => dayjs(eventEndTime).format("l LT"),
  }

  const columns = !isMobile
    ? [
        nameColumn,
        {
          title: t("common:registrations"),
          key: "registrations",
          render: (event: Event) => <EventQuotaPopover event={event} />,
        },
        {
          title: t("events:organizer"),
          dataIndex: ["ownerOrganization", "name"],
          key: "organizationName",
          filters: [
            ...Array.from(new Set(organizations?.map((o) => o.name))).map(
              (name) => ({ text: name, value: name })
            ),
          ],
          sorter: {
            compare: Sorter.TEXT,
          },
          render: (name: string, record: Event, index: number) => (
            <Tag
              key={`${record.id}-${index}`}
              color={record.ownerOrganization.color}
            >
              {name?.toUpperCase()}
            </Tag>
          ),
        },
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
              <Tag key={`${record.id}-${index}`} color={record.category.color}>
                {name?.toUpperCase()}
              </Tag>
            )
          },
        },
        endTimeColumn,
      ]
    : [nameColumn, endTimeColumn]

  return (
    <>
      <H3>{t("common:registrationClosed")}</H3>
      <ServerPaginatedTable
        columns={columns}
        data-cy="homepage-signup-closed-events"
        dataField="signupClosedEvents"
        queryDocument={HomePageEventsDocument}
        size="middle"
        showPagination
        showSizeChanger
      />
    </>
  )
}

export default Home
