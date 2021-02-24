import React from "react";
import { EventRegistrationForm, Redirect, SharedLayout } from "@app/components";
import {
  UpdateEventRegistrationDocument,
  useUpdateEventRegistrationPageQuery,
} from "@app/graphql";
import { filterObjectByKeys } from "@app/lib";
import { Col, PageHeader, Row } from "antd";
import { NextPage } from "next";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";

type UpdateFormInitialValues = {
  firstName: string;
  lastName: string;
};

function constructInitialValues(values: any) {
  const filteredValues = filterObjectByKeys(values, [
    "firstName",
    "lastName",
  ]) as UpdateFormInitialValues;

  return filteredValues;
}

const UpdateEventRegistrationPage: NextPage = () => {
  const { t, lang } = useTranslation("register");
  const router = useRouter();
  const { registrationId } = router.query;

  const query = useUpdateEventRegistrationPageQuery({
    variables: { registrationId },
  });
  const { loading, error } = query;

  const registration = query?.data?.registration;
  const event = registration?.event;
  const quota = registration?.quota;

  // If registration is not found redirect to index
  if (!loading && !error && !registration) {
    return <Redirect href="/" layout />;
  }

  return (
    <SharedLayout query={query} title="">
      <Row>
        <Col flex={1}>
          <PageHeader title={t("updateRegistration.title")} />
          <div>
            {event?.name[lang]} - {quota?.title[lang]}
          </div>
          <EventRegistrationForm
            formMutationDocument={UpdateEventRegistrationDocument}
            formRedirect={{
              pathname: "/event/[slug]",
              query: { slug: event?.slug },
            }}
            initialValues={constructInitialValues(registration)}
            registrationId={registrationId as string}
            type="update"
          />
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default UpdateEventRegistrationPage;
