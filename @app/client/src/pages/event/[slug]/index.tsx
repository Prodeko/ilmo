import React, { useState } from "react";
import {
  ProgressBar,
  SharedLayout,
  SimpleTable,
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
import { Button, Card, Col, Grid, PageHeader, Row, Typography } from "antd";
import dayjs from "dayjs";
import { NextPage } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

const { useBreakpoint } = Grid;
const { Title, Paragraph } = Typography;

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
  const { t, lang } = useTranslation("register");
  const screens = useBreakpoint();
  const isMobile = screens["xs"];

  const [registrations, setRegistrations] = useState<
    Registration[] | null | undefined
  >(event.registrations.nodes as Registration[]);
  useEventRegistrationsSubscription({
    variables: { eventId: event?.id, after: event.createdAt },
    skip: !event?.id,
    onSubscriptionData: ({ subscriptionData }) =>
      setRegistrations(
        subscriptionData?.data?.eventRegistrations
          ?.registrations as Registration[]
      ),
  });

  const columns = [
    {
      title: t("common:name"),
      dataIndex: "fullName",
      key: "fullName",
    },
    {
      title: t("forms.quota"),
      dataIndex: ["quota", "title", lang],
      key: "quota",
    },
    {
      title: t("createdAt"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (createdAt: string) => dayjs(createdAt).format("l LTS"),
    },
  ];

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
          {event.headerImageFile && (
            <Image
              alt={t("events:headerImage")}
              height={315}
              loader={uploadsLoader}
              objectFit="cover"
              src={event.headerImageFile}
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
            title={t("sidebar.title")}
            bordered
          >
            {event.quotas.nodes.map((q, i) => {
              const { size, registrations } = q;
              const percentageFilled = Math.round(
                (registrations.totalCount / size) * 100
              );

              return (
                <div key={q.id} style={{ paddingBottom: 12 }}>
                  <Link
                    href={{
                      pathname: "/register/e/[eventId]/q/[quotaId]",
                      query: { eventId: event.id, quotaId: q.id },
                    }}
                  >
                    <Button
                      data-cy={`eventpage-quotas-link-${i}`}
                      disabled={registrations.totalCount >= size}
                      target="a"
                      block
                    >
                      {q.title[lang]}
                    </Button>
                  </Link>
                  <ProgressBar completed={percentageFilled} />
                </div>
              );
            })}
          </Card>
        </Col>
        <Col sm={{ span: 16 }} xs={{ span: 24 }}>
          <Title level={2}>{event.name[lang]}</Title>
          <Paragraph>{event.description[lang]}</Paragraph>
          <SimpleTable
            columns={columns}
            data={registrations}
            data-cy="eventpage-signups-table"
            size="small"
            style={{
              marginTop: "1rem",
            }}
          />
        </Col>
      </Row>
    </>
  );
};

export default EventPage;
