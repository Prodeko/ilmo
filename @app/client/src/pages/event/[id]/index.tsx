import React from "react";
import { P, SharedLayout, useEventId, useEventLoading } from "@app/components";
import { EventPage_EventFragment, useEventPageQuery } from "@app/graphql";
import { Col, Empty, PageHeader, Row } from "antd";
import { NextPage } from "next";

interface EventPageInnerProps {
  event: EventPage_EventFragment;
}

const EventPageInner: React.FC<EventPageInnerProps> = (props) => {
  const { event } = props;

  return (
    <Row>
      <Col flex={1}>
        <div>
          <PageHeader
            title={"Dashboard"}
            extra={
              [<P key="bileet">BILEET</P>]
              /*
              organization.currentUserIsBillingContact ||
              organization.currentUserIsOwner
                ? [
                    <ButtonLink
                      key="settings"
                      href={`/o/[slug]/settings`}
                      as={`/o/${organization.slug}/settings`}
                      type="primary"
                      data-cy="organizationpage-button-settings"
                    >
                      Settings
                    </ButtonLink>,
                  ]
                : null*/
            }
          />

          <Empty description={<span>{event.description}</span>} />
        </div>
      </Col>
    </Row>
  );
};

const EventPage: NextPage = () => {
  const id = useEventId();
  const query = useEventPageQuery({ variables: { id } });
  const eventLoadingElement = useEventLoading(query);
  const event = query?.data?.event;

  return (
    <SharedLayout
      title={`${event?.name ?? "Name not found :("}`}
      titleHref={`/event/[id]`}
      titleHrefAs={`/event/${id}`}
      query={query}
    >
      {eventLoadingElement || <EventPageInner event={event!} />}
    </SharedLayout>
  );
};

export default EventPage;
