import { useCallback, useEffect, useState } from "react"
import {
  EventDescription,
  EventQuotasCard,
  EventRegistrationsTable,
  SharedLayout,
  SignupState,
  useEventLoading,
  useIsMobile,
  useQuerySlug,
} from "@app/components"
import {
  EventPage_EventFragment,
  useCurrentTimeSubscription,
  useEventPageSubscription,
  useSharedQuery,
} from "@app/graphql"
import { Col, Divider, notification, PageHeader, Row } from "antd"
import dayjs from "dayjs"
import { m } from "framer-motion"
import { NextPage } from "next"
import Image from "next/image"
import { Router, useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

const EventPage: NextPage = () => {
  const slug = useQuerySlug()
  const { t, lang } = useTranslation("events")
  const [query] = useSharedQuery()
  const [subscription] = useEventPageSubscription({ variables: { slug } })
  const eventLoadingElement = useEventLoading(subscription)
  const event = subscription?.data?.eventBySlug
  const { fetching, stale } = subscription

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

const POLL_SERVER_TIME_MINUTES_BEFORE = 15
const NOTIFICATION_KEY = "time-notification"

const EventPageInner: React.FC<EventPageInnerProps> = ({ event }) => {
  const router = useRouter()
  const { t } = useTranslation("events")
  const isMobile = useIsMobile()
  const [pauseServerTime, setPauseServerTime] = useState(false)
  const [signupState, setSignupState] = useState<SignupState>({
    upcoming: false,
    open: false,
    closed: false,
  })

  // Because this subscription returns new data every second, we wrap
  // heavy to render child components in React.memo. It is only active
  // 15 minutes before event registration opens.
  const [{ data }] = useCurrentTimeSubscription({ pause: pauseServerTime })

  const {
    id,
    headerImageFile,
    registrationStartTime,
    registrationEndTime,
    registrations,
  } = event

  // Stop subscription and close notification if we change routes
  Router.events.on("routeChangeStart", () => {
    setPauseServerTime(true)
    notification.close(NOTIFICATION_KEY)
  })

  const handleSignupState = useCallback((time, startTime, endTime) => {
    // We cannot rely on event.signup* since those are exposed to the API
    // via Postgraphile computed columns (https://www.graphile.org/postgraphile/computed-columns/).
    // This page uses Postgraphile live queries (https://www.graphile.org/postgraphile/live-queries/)
    // to automaticaly update information (registrations, quota sizes, description etc.).
    // Computed columns are a known limitation of the @graphile/subscriptions-lds plugin
    // which uses wal2json to detect updates in the database. It cannot detect updates computed
    // column fields. This is why we replicate the signup* fields on the frontend based on
    // a timestamp fetched from the server.
    if (time.isBefore(startTime)) {
      setSignupState({ upcoming: true, open: false, closed: false })
    } else if (time.isAfter(startTime) && time.isBefore(endTime)) {
      setSignupState({ upcoming: false, open: true, closed: false })
    } else if (time.isAfter(endTime)) {
      setSignupState({ upcoming: false, open: false, closed: true })
    }
  }, [])

  useEffect(() => {
    const { currentTime } = data || {}
    if (currentTime) {
      const time = dayjs(currentTime)
      const startTime = dayjs(
        registrationStartTime,
        "YYYY-MM-DDTHH:mm:ss+03:00"
      )
      const endTime = dayjs(registrationEndTime, "YYYY-MM-DDTHH:mm:ss+03:00")

      handleSignupState(time, startTime, endTime)

      if (
        time.isBefore(
          startTime.subtract(POLL_SERVER_TIME_MINUTES_BEFORE, "minutes")
        )
      ) {
        // Pause fetching server time if it is more than 15 minutes
        // to registration opening. 15 minutes is chosen so that we don't keep
        // a websocket that pushes data every 1s or so (actual timeout defined
        // in SubscriptionPlugin.ts) to the client open for a prolonged period
        // of time. The automatic event opening won't work if someone comes to
        // the page 15 minutes before the opening and never refreshes the page.
        // We assume that most people won't do that and if this becomes a
        // problem the timeout can be increased.
        setPauseServerTime(true)

        // Just in case. Can happen if the registration times are changed within
        // one hour of the registration opening and someone has the page open
        // for a long time
        notification.close(NOTIFICATION_KEY)
      } else if (time.isAfter(startTime)) {
        // Pause fetching server time after and stop displaying the notification
        // after registration has opened
        setPauseServerTime(true)
        notification.close(NOTIFICATION_KEY)
      } else if (time.isAfter(startTime.subtract(1, "minute"))) {
        // Show a notification with the current server time 1 minute before
        // the registration to an event opens
        const description = (
          <Row>
            <Col span={8} style={{ textAlign: "right", marginRight: 12 }}>
              {t("timer.registrationStarts")}:
            </Col>
            <Col span={14}>{startTime.format("YYYY-MM-DD HH:mm:ss")}</Col>
            <Col span={8} style={{ textAlign: "right", marginRight: 12 }}>
              {t("timer.time")}:
            </Col>
            <Col span={14}>{time.format("YYYY-MM-DD HH:mm:ss")}</Col>
            <Divider style={{ margin: "8px 0" }} />
            <span>{t("timer.instructions")}</span>
          </Row>
        )
        notification.open({
          key: NOTIFICATION_KEY,
          message: t("timer.title"),
          duration: 0,
          description,
          placement: "bottomRight",
          closeIcon: <div></div>,
        })
        setPauseServerTime(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

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
          <EventQuotasCard
            event={event}
            registrations={registrations.nodes}
            signupState={signupState}
          />
        </Col>
        <Col sm={{ span: 16 }} xs={{ span: 24 }}>
          <EventDescription event={event} signupState={signupState} />
          <EventRegistrationsTable
            data-cy="eventpage-signups-table"
            registrations={registrations.nodes}
          />
        </Col>
      </Row>
    </>
  )
}

export default EventPage
