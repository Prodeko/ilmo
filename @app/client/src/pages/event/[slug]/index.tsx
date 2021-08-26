import {
  EventDescription,
  EventQuotasCard,
  EventRegistrationsTable,
  SharedLayout,
  useEventLoading,
  useEventRegistrations,
  useIsMobile,
  useQuerySlug,
} from "@app/components"
import { EventPage_EventFragment, useEventPageQuery } from "@app/graphql"
import { Col, PageHeader, Row } from "antd"
import { m } from "framer-motion"
import { NextPage } from "next"
import Image from "next/image"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

const EventPage: NextPage = () => {
  const slug = useQuerySlug()
  const { t, lang } = useTranslation("events")
  const [query] = useEventPageQuery({ variables: { slug } })
  const eventLoadingElement = useEventLoading(query)
  const event = query?.data?.eventBySlug
  const { fetching, stale } = query

  return (
    <SharedLayout
      query={query}
      title={
        fetching || stale
          ? t("common:loading")
          : `${event?.name[lang] ?? t("eventNotFound")}`
      }
    >
      {eventLoadingElement || <EventPageInner event={event!} />}
    </SharedLayout>
  )
}

interface EventPageInnerProps {
  event: EventPage_EventFragment
}

const EventPageInner: React.FC<EventPageInnerProps> = ({ event }) => {
  const router = useRouter()
  const { t } = useTranslation("events")
  const isMobile = useIsMobile()

  const {
    id,
    headerImageFile,
    createdAt,
    registrations: eventRegistrations,
  } = event

  // Set registrations initially from EventPage_Query data
  // Use a subscription to fetch event registrations in real time
  const initialRegistrations = eventRegistrations.nodes
  const registrations = useEventRegistrations(
    id,
    createdAt,
    initialRegistrations
  )

  return (
    <>
      <PageHeader
        title={t("common:backHome")}
        onBack={() => router.push("/")}
      />
      <Row>
        <Col
          sm={{ span: 16 }}
          style={{ display: "inline-block" }}
          xs={{ span: 24 }}
        >
          {headerImageFile && (
            <m.figure layoutId={`event-${id}-header-image`}>
              <Image
                alt={t("headerImage")}
                data-cy="eventpage-header-image"
                height={315}
                objectFit="cover"
                src={headerImageFile}
                width={851}
                priority
              />
            </m.figure>
          )}
        </Col>
        <Col
          sm={{ span: 8 }}
          style={{
            maxHeight: isMobile ? "100%" : 0,
            position: !isMobile ? "sticky" : "initial",
            top: !isMobile ? 24 : 0,
          }}
          xs={{ span: 24 }}
        >
          <EventQuotasCard event={event} registrations={registrations} />
        </Col>
        <Col sm={{ span: 16 }} xs={{ span: 24 }}>
          <EventDescription event={event} />
          <EventRegistrationsTable
            data-cy="eventpage-signups-table"
            registrations={registrations}
          />
        </Col>
      </Row>
    </>
  )
}

export default EventPage
