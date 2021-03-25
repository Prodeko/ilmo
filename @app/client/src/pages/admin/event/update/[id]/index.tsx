import React from "react";
import { AdminLayout, EventForm, Redirect, useQueryId } from "@app/components";
import {
  QuotasConnection,
  UpdateEventDocument,
  UpdateEventQuotasDocument,
  useUpdateEventPageQuery,
} from "@app/graphql";
import { filterObjectByKeys } from "@app/lib";
import { Col, PageHeader, Row } from "antd";
import dayjs from "dayjs";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";

type UpdateFormInitialValues = {
  name: string;
  description: string;
  eventStartTime: string;
  eventEndTime: string;
  registrationStartTime: string;
  registrationEndTime: string;
  isHighlighted: boolean;
  isDraft: boolean;
  headerImageFile: string;
  quotas: QuotasConnection;
};

function constructInitialValues(values: any) {
  const languages = values && Object.keys(values.name);
  const filteredValues = filterObjectByKeys(values, [
    "name",
    "description",
    "eventStartTime",
    "eventEndTime",
    "registrationStartTime",
    "registrationEndTime",
    "isHighlighted",
    "isDraft",
    "headerImageFile",
    "quotas",
  ]) as UpdateFormInitialValues;

  const {
    eventStartTime,
    eventEndTime,
    registrationStartTime,
    registrationEndTime,
    quotas: quotasConnection,
  } = filteredValues || {};

  const eventTime = [dayjs(eventStartTime), dayjs(eventEndTime)];
  const registrationTime = [
    dayjs(registrationStartTime),
    dayjs(registrationEndTime),
  ];
  const quotas = quotasConnection?.nodes.map((quota) =>
    filterObjectByKeys(quota, [
      "id",
      "position",
      "title",
      "size",
      "registrations",
    ])
  );

  return {
    organizationId: values?.ownerOrganization?.id,
    categoryId: values?.category?.id,
    ...filteredValues,
    registrationTime,
    eventTime,
    languages,
    quotas,
  };
}

const UpdateEventPage: NextPage = () => {
  const { t } = useTranslation("events");
  const eventId = useQueryId();
  const query = useUpdateEventPageQuery({
    variables: { id: eventId },
  });
  const { loading, error } = query;
  const event = query?.data?.event;

  // If event is not found redirect to index
  if (!loading && !error && !event) {
    return <Redirect href="/" layout />;
  }

  // Redirect to index if the user is not part of any organization
  const organizationMemberships =
    query?.data?.currentUser?.organizationMemberships?.totalCount;
  if (organizationMemberships <= 0) {
    return <Redirect href="/" layout />;
  }

  return (
    <AdminLayout href="/admin/event/update" query={query}>
      <Row>
        <Col flex={1}>
          <PageHeader title={t("updateEvent.title")} />
          <EventForm
            data={query.data}
            eventId={eventId}
            eventMutationDocument={UpdateEventDocument}
            formRedirect="/"
            initialValues={constructInitialValues(event)}
            quotasMutationDocument={UpdateEventQuotasDocument}
            type="update"
          />
        </Col>
      </Row>
    </AdminLayout>
  );
};

export default UpdateEventPage;
