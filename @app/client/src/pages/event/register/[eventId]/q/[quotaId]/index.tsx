import React, { useMemo, useState } from "react";
import { EventRegistrationForm, Redirect, SharedLayout } from "@app/components";
import {
  CreateRegistrationDocument,
  Registration,
  useEventRegistrationPageQuery,
  useEventRegistrationsSubscription,
} from "@app/graphql";
import { List, PageHeader, Typography } from "antd";
import { NextPage } from "next";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

const EventRegistrationPage: NextPage = () => {
  const { t, lang } = useTranslation("register");
  const router = useRouter();
  const { eventId, quotaId } = router.query;

  const query = useEventRegistrationPageQuery({
    variables: { eventId, quotaId },
  });
  const { loading, error } = query;

  const event = query?.data?.event;
  const quota = query?.data?.quota;

  // Subscribe to registrations created after this timestamp
  const after = useMemo(() => new Date().toISOString(), []);
  const [recentRegistrations, setRecentRegistrations] = useState<
    Registration[] | null | undefined
  >(undefined);
  useEventRegistrationsSubscription({
    variables: { eventId, after },
    skip: !eventId,
    onSubscriptionData: ({ subscriptionData }) =>
      setRecentRegistrations(
        subscriptionData?.data?.eventRegistrations
          ?.registrations as Registration[]
      ),
  });

  // If event or quota is not found, redirect to index
  if (!loading && !error && (!event || !quota)) {
    return <Redirect href="/" layout />;
  }

  return (
    <SharedLayout query={query} title="">
      <PageHeader
        title={`${t("title")} ${event?.name[lang] || t("common:loading")} - ${
          quota?.title[lang] || t("common:loading")
        }`}
      />
      <EventRegistrationForm
        eventId={event?.id}
        formMutationDocument={CreateRegistrationDocument}
        formRedirect={{
          pathname: "/event/[slug]",
          query: { slug: event?.slug },
        }}
        quotaId={quota?.id}
        type="create"
      />
      {recentRegistrations && (
        <List
          dataSource={recentRegistrations}
          header={<div>{t("recentlyRegisteredHeader")}</div>}
          renderItem={(item) => (
            <List.Item>
              <Typography.Text>
                {item?.fullName} {t("recentlyRegisteredListItem")}{" "}
                {item?.quota?.title[lang]}
              </Typography.Text>
            </List.Item>
          )}
          bordered
        />
      )}
    </SharedLayout>
  );
};

export default EventRegistrationPage;
