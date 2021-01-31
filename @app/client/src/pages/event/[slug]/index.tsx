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
import { Button, Card, Col, Grid, PageHeader, Row, Tag } from "antd";
import dayjs from "dayjs";
import { NextPage } from "next";
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
      title={query.loading ? "" : `${event?.name[lang] ?? t("eventNotFound")}`}
      titleHref="/event/[slug]"
      titleHrefAs={`/event/${event?.slug}`}
      query={query}
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
        tags={[
          <Tag color="red" key={event.ownerOrganization?.id}>
            {event.ownerOrganization?.name}
          </Tag>,
          <Tag color="red" key={event.category?.id}>
            {event.category?.name[lang]}
          </Tag>,
        ]}
      />
      <Row>
        <Col xs={{ span: 24, order: 2 }} sm={{ span: 16, order: 1 }}>
          {event.description[lang]}
          <SimpleTable
            data-cy="eventpage-signups-table"
            data={registrations}
            columns={columns}
            style={{
              marginTop: "1rem",
            }}
            size="small"
          />
        </Col>
        <Col xs={{ span: 24, order: 1 }} sm={{ span: 8, order: 1 }}>
          <Card
            data-cy="eventpage-quotas-card"
            title={t("sidebar.title")}
            style={{
              marginLeft: !isMobile ? "1rem" : undefined,
              marginBottom: isMobile ? "1rem" : undefined,
              width: "100%",
            }}
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
                      target="a"
                      disabled={registrations.totalCount >= size}
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
      </Row>
    </>
  );
};

export default EventPage;
