import React from "react";
import {
  AuthRestrict,
  EventForm,
  Redirect,
  SharedLayout,
} from "@app/components";
import {
  CreateEventDocument,
  CreateEventQuotasDocument,
  useCreateEventPageQuery,
} from "@app/graphql";
import { Col, PageHeader, Row } from "antd";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";

const CreateEventPage: NextPage = () => {
  const { t } = useTranslation("events");
  const query = useCreateEventPageQuery();

  // Redirect to index if the user is not part of any organization
  const organizationMemberships =
    query?.data?.currentUser?.organizationMemberships?.nodes;
  if (organizationMemberships && organizationMemberships?.length <= 0) {
    return <Redirect href="/" layout />;
  }

  return (
    <SharedLayout forbidWhen={AuthRestrict.LOGGED_OUT} query={query} title="">
      <Row>
        <Col flex={1}>
          <PageHeader title={t("createEvent.title")} />
          <EventForm
            data={query.data}
            eventMutationDocument={CreateEventDocument}
            formRedirect="/"
            quotasMutationDocument={CreateEventQuotasDocument}
            type="create"
          />
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default CreateEventPage;
