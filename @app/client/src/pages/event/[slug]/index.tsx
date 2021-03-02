import React, { useState } from "react";
import {
  EventRegistrationsTable,
  H2,
  P,
  ProgressBar,
  SharedLayout,
  useEventLoading,
  useEventSlug,
} from "@app/components";
import {
  EventPage_EventFragment,
  Registration,
  useEventPageQuery,
  useEventRegistrationsSubscription,
} from "@app/graphql";
import { uploadsLoader } from "@app/lib";
import { Button, Card, Col, Grid, PageHeader, Row } from "antd";
import { NextPage } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

const { useBreakpoint } = Grid;

const EventPage: NextPage = () => {
  const slug = useEventSlug();
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
    signupClosed,
    signupUpcoming,
    quotas,
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
          <Card
            data-cy="eventpage-quotas-card"
            style={{
              marginLeft: !isMobile ? "1rem" : undefined,
              marginBottom: isMobile ? "1rem" : undefined,
              width: "100%",
            }}
            title={t("register:sidebar.title")}
            bordered
          >
            {quotas?.nodes.map((quota, i) => {
              const { id: quotaId, title, size } = quota;
              const totalCount = registrations.filter(
                (r) => r.quota.id === quotaId
              ).length;
              const percentageFilled = Math.round((totalCount / size) * 100);

              return (
                <div key={quotaId} style={{ paddingBottom: 12 }}>
                  <Link
                    href={{
                      pathname: "/event/register/[eventId]/q/[quotaId]",
                      query: { eventId, quotaId },
                    }}
                  >
                    <Button
                      data-cy={`eventpage-quotas-link-${i}`}
                      disabled={signupClosed || signupUpcoming}
                      target="a"
                      block
                    >
                      {title[lang]}
                    </Button>
                  </Link>
                  <ProgressBar
                    filled={totalCount}
                    percentageFilled={percentageFilled}
                    size={size}
                  />
                </div>
              );
            })}
          </Card>
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
