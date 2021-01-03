import React from "react";
import {
  ProgressBar,
  ServerPaginatedTable,
  SharedLayout,
  useEventLoading,
  useEventSlug,
} from "@app/components";
import {
  EventPage_EventFragment,
  EventPageDocument,
  useEventPageQuery,
} from "@app/graphql";
import { Button, Card, Col, PageHeader, Row, Tag } from "antd";
import dayjs from "dayjs";
import { NextPage } from "next";
import Link from "next/link";
import useTranslation from "next-translate/useTranslation";
import { useRouter } from "next/router";

const EventPage: NextPage = () => {
  const slug = useEventSlug();
  const query = useEventPageQuery({ variables: { slug } });
  const eventLoadingElement = useEventLoading(query);
  const event = query?.data?.eventBySlug;

  return (
    <SharedLayout
      title={query.loading ? "" : `${event?.name ?? "Event not found :("}`}
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
  const { t } = useTranslation("register");
  const slug = useEventSlug();

  const columns = [
    {
      title: t("forms.firstName"),
      dataIndex: "firstName",
      key: "firstName",
    },
    {
      title: t("forms.lastName"),
      dataIndex: "lastName",
      key: "lastName",
    },
    {
      title: t("forms.quota"),
      dataIndex: ["quota", "title"],
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
    <Row>
      <Col flex={1}>
        <div>
          <PageHeader
            title={"Dashboard"}
            onBack={() => router.push("/")}
            extra={[
              <Tag color="red" key={event.category?.id}>
                {event.category?.name}
              </Tag>,
            ]}
          />
          <Row>
            <Col xs={{ span: 24, order: 2 }} sm={{ span: 16, order: 1 }}>
              {event.description}

              <ServerPaginatedTable
                queryDocument={EventPageDocument}
                variables={{ slug }}
                columns={columns}
                dataField="eventBySlug.registrations"
                showPagination={false}
              />
            </Col>
            <Col xs={{ span: 24, order: 1 }} sm={{ span: 8, order: 1 }}>
              <Card
                title={t("sidebar.title")}
                bordered
                style={{ width: "100%" }}
              >
                {event.quotas.nodes.map((q) => {
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
                          target="a"
                          disabled={registrations.totalCount >= size}
                          block
                        >
                          {q.title}
                        </Button>
                      </Link>
                      <ProgressBar completed={percentageFilled} />
                    </div>
                  );
                })}
              </Card>
            </Col>
          </Row>
        </div>
      </Col>
    </Row>
  );
};

export default EventPage;
