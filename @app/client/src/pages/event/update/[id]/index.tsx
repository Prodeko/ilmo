import React from "react";
import {
  AuthRestrict,
  EventForm,
  Redirect,
  SharedLayout,
  useEventId,
} from "@app/components";
import { UpdateEventDocument, useUpdateEventPageQuery } from "@app/graphql";
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
  headerImageFile: string;
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
    "headerImageFile",
  ]) as UpdateFormInitialValues;

  const {
    eventStartTime,
    eventEndTime,
    registrationStartTime,
    registrationEndTime,
  } = filteredValues || {};

  const eventTime = [dayjs(eventStartTime), dayjs(eventEndTime)];
  const registrationTime = [
    dayjs(registrationStartTime),
    dayjs(registrationEndTime),
  ];
  return {
    organizationId: values?.ownerOrganization?.id,
    categoryId: values?.category?.id,
    ...filteredValues,
    registrationTime,
    eventTime,
    languages,
  };
}

const UpdateEventPage: NextPage = () => {
  const { t } = useTranslation("events");
  const eventId = useEventId();
  const query = useUpdateEventPageQuery({
    variables: { id: eventId },
  });
  const { loading, error } = query;
  const event = query?.data?.event;

  // If event is not found redirect to index
  if (!loading && !error && !event) {
    return <Redirect href="/" layout />;
  }

  return (
    <SharedLayout forbidWhen={AuthRestrict.LOGGED_OUT} query={query} title="">
      <Row>
        <Col flex={1}>
          <PageHeader title={t("updateEvent.title")} />
          <EventForm
            data={query.data}
            eventId={eventId}
            formMutationDocument={UpdateEventDocument}
            formRedirect="/"
            initialValues={constructInitialValues(event)}
            type="update"
          />
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default UpdateEventPage;
