import React from "react";
import { AdminLayout, EventForm, Redirect } from "@app/components";
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
    query?.data?.currentUser?.organizationMemberships?.totalCount;
  if (organizationMemberships <= 0) {
    return <Redirect href="/" layout />;
  }

  return (
    <AdminLayout href="/admin/event/create" query={query}>
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
    </AdminLayout>
  );
};

export default CreateEventPage;
