import React, { useMemo, useState } from "react";
import { EventRegistrationForm, Redirect, SharedLayout } from "@app/components";
import {
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

  const currentUser = query?.data?.currentUser;
  const event = query?.data?.event;
  const quota = query?.data?.quota;
  const { signupClosed, signupUpcoming } = event || {};

  const { name, primaryEmail } = currentUser || {};
  // TODO: The users table schema could be changed to include first
  // and last names. For now infer first and last name like this...
  const [firstName, lastName] = name ? name?.split(" ") : [];

  const formInitialValues = {
    firstName,
    lastName,
    email: primaryEmail,
  };

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

  // If event or quota is not found, or if event
  // registration is not open redirect to index
  if (
    !loading &&
    !error &&
    (!event || !quota || signupClosed || signupUpcoming)
  ) {
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
        formRedirect={{
          pathname: "/event/[slug]",
          query: { slug: event?.slug },
        }}
        initialValues={formInitialValues}
        quotaId={quota?.id}
        type="create"
      />
      {recentRegistrations && (
        <List
          dataSource={recentRegistrations}
          header={<div>{t("recentlyRegisteredHeader")}</div>}
          renderItem={(item, i) => {
            const name = item?.fullName;
            const quota = item?.quota?.title[lang];
            return i === 0 || name ? (
              <List.Item>
                <Typography.Text>
                  {i === 0
                    ? t("you")
                    : `${name} ${t("recentlyRegisteredListItem")} ${quota}`}
                </Typography.Text>
              </List.Item>
            ) : null;
          }}
          bordered
        />
      )}
    </SharedLayout>
  );
};

export default EventRegistrationPage;
