import { useCallback, useEffect, useState } from "react"
import {
  ButtonLink,
  EventDescription,
  EventQuotasCard,
  EventRegistrationsTables,
  Redirect,
  SharedLayout,
  SignupState,
  useIsMobile,
  useLoading,
  useQuerySlug,
  useTranslation,
} from "@app/components"
import {
  EventPage_EventFragment,
  SharedLayout_UserFragment,
  useCurrentTimeSubscription,
  useEventPageSubscription,
  useSharedQuery,
} from "@app/graphql"
import { Col, Divider, message, notification, PageHeader, Row } from "antd"
import dayjs from "dayjs"
import Image from "next/image"
import { useRouter } from "next/router"

import type { NextPage } from "next"

const EventPage: NextPage = () => {
  const slug = useQuerySlug()
  const { t, lang } = useTranslation("events")
  const [query] = useSharedQuery()
  const [subscription] = useEventPageSubscription({ variables: { slug } })
  const loadingElement = useLoading(subscription, "eventBySlug")
  const event = subscription?.data?.eventBySlug
  const { fetching, stale } = subscription
  const name = event?.name[lang]
  const title =
    fetching || stale
      ? t("common:loading")
      : query.error
      ? ""
      : `${name ?? t("eventNotFound")}`

  return (
    <SharedLayout query={query} title={title}>
      {loadingElement || (
        <EventPageInner currentUser={query.data.currentUser} event={event} />
      )}
    </SharedLayout>
  )
}

interface EventPageInnerProps {
  event: EventPage_EventFragment
  currentUser: SharedLayout_UserFragment
}

const POLL_SERVER_TIME_MINUTES_BEFORE = 15
const NOTIFICATION_KEY = "time-notification"

const EventPageInner: React.FC<EventPageInnerProps> = ({
  event,
  currentUser,
}) => {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { t, lang } = useTranslation("events")
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

  useEffect(() => {
    const onRouteChangeStart = (route: string) => {
      if (!route.includes(event.slug)) {
        // Stop subscription and close notification if the route
        // is changed to another page
        setPauseServerTime(true)
        notification.close(NOTIFICATION_KEY)
      }
    }
    router.events.on("routeChangeStart", onRouteChangeStart)

    return () => router.events.off("routeChangeStart", onRouteChangeStart)
  }, [router, event])

  const handleSignupState = useCallback((time, startTime, endTime) => {
    // This page uses Postgraphile live queries (https://www.graphile.org/postgraphile/live-queries/)
    // to automaticaly update information (registrations, quota sizes, description etc.).
    // We cannot rely on event.signup* since those fields are exposed to the API
    // using Postgraphile computed columns (https://www.graphile.org/postgraphile/computed-columns/).
    // Computed columns are a known limitation of the @graphile/subscriptions-lds plugin
    // which uses wal2json to detect updates in the database. It cannot detect updates on
    // computed column fields. This is why we replicate the signup* fields on the frontend
    // based on a timestamp fetched from the server.
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
      const time = dayjs(currentTime).tz(process.env.TZ)
      const startTime = dayjs(registrationStartTime).tz(process.env.TZ)
      const endTime = dayjs(registrationEndTime).tz(process.env.TZ)

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
      } else if (time.isAfter(startTime.subtract(10, "minute"))) {
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

  const {
    headerImageFile,
    registrationStartTime,
    registrationEndTime,
    registrations,
  } = event

  const hasNameInSelectedLocale = event?.name?.[lang]
  if (!hasNameInSelectedLocale) {
    message.info({
      key: "only-in-another-language-message",
      duration: 2.5,
      content: t("availableOnlyInLang"),
    })
    return <Redirect href="/" layout />
  }

  return (
    <>
      <PageHeader
        extra={
          currentUser?.isAdmin ? (
            <ButtonLink
              data-cy="eventpage-button-admin-link"
              href={`/admin/event/update/${event.id}`}
              size="large"
              type="success"
              block
            >
              {t("common:modify")}
            </ButtonLink>
          ) : null
        }
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
            <Image
              alt={t("headerImage")}
              data-cy="eventpage-header-image"
              height={315}
              objectFit="cover"
              src={headerImageFile}
              width={851}
              priority
            />
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
          <EventRegistrationsTables
            event={event}
            registrations={registrations.nodes}
          />
        </Col>
      </Row>
    </>
  )
}

export default EventPage
