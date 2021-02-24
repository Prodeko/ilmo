import React from "react";
import { AuthRestrict, EventForm, SharedLayout } from "@app/components";
import { CreateEventDocument, useCreateEventPageQuery } from "@app/graphql";
import { Col, PageHeader, Row } from "antd";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";

const CreateEventPage: NextPage = () => {
  const { t } = useTranslation("events");
  const query = useCreateEventPageQuery();

  return (
    <SharedLayout forbidWhen={AuthRestrict.LOGGED_OUT} query={query} title="">
      <Row>
        <Col flex={1}>
          <PageHeader title={t("createEvent.title")} />
          <EventForm
            data={query.data}
            formMutationDocument={CreateEventDocument}
            formRedirect="/"
            type="create"
          />
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default CreateEventPage;
