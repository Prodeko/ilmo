import React, { useState } from "react";
import {
  EventQuotasCard,
  EventRegistrationsTable,
  H2,
  P,
  SharedLayout,
  useEventLoading,
  useQuerySlug,
} from "@app/components";
import {
  EventPage_EventFragment,
  Registration,
  useEventPageQuery,
  useEventRegistrationsSubscription,
} from "@app/graphql";
import { uploadsLoader } from "@app/lib";
import { Col, PageHeader, Row } from "antd";
import useBreakpoint from "antd/lib/grid/hooks/useBreakpoint";
import { NextPage } from "next";
import Image from "next/image";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

const EventPage: NextPage = () => {
  const slug = useQuerySlug();
  const { t, lang } = useTranslation("events");
  const query = useEventPageQuery({ variables: { slug } });
  const eventLoadingElement = useEventLoading(query);
  const event = query?.data?.eventBySlug;

  return (
    <SharedLayout
      query={query}
      title={query.loading ? "" : `${event?.name[lang] ?? t("eventNotFound")}`}
      titleHref="/event/[slug]"
      titleHrefAs={`/event/${event?.slug}`}
    >
      {eventLoadingElement || <EventPageInner event={event!} />}
    </SharedLayout>
  );
};

interface EventPageInnerProps {
  event: EventPage_EventFragment;
}

const EventPageInner: React.FC<EventPageInnerProps> = ({ event }) => {
  const router = useRouter();
  const { t, lang } = useTranslation("events");
  const screens = useBreakpoint();
  const isMobile = screens["xs"];
  const {
    id: eventId,
    name,
    description,
    headerImageFile,
    createdAt,
    registrations: eventRegistrations,
  } = event;

  // Set registrations initially from EventPage_Query data
  const [registrations, setRegistrations] = useState<
    Registration[] | null | undefined
  >(eventRegistrations.nodes as Registration[]);

  // Use a subscription to fetch event registrations in real time
  useEventRegistrationsSubscription({
    variables: { eventId, after: createdAt },
    skip: !eventId,
    onSubscriptionData: ({ subscriptionData }) =>
      // Update state when subscription receives data
      setRegistrations(
        subscriptionData?.data?.eventRegistrations
          ?.registrations as Registration[]
      ),
  });

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
            <Image
              alt={t("headerImage")}
              data-cy="eventpage-header-image"
              height={315}
              loader={uploadsLoader}
              objectFit="cover"
              src={headerImageFile}
              width={851}
              priority
            />
          )}
        </Col>
        <Col
          sm={{ span: 8 }}
          style={{ maxHeight: isMobile ? "100%" : 0 }}
          xs={{ span: 24 }}
        >
          <EventQuotasCard event={event} registrations={registrations} />
        </Col>
        <Col sm={{ span: 16 }} xs={{ span: 24 }}>
          <H2>{name[lang]}</H2>
          <P>{description[lang]}</P>
          <EventRegistrationsTable
            data-cy="eventpage-signups-table"
            registrations={registrations}
          />
        </Col>
      </Row>
    </>
  );
};

export default EventPage;
