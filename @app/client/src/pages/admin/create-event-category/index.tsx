import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import { AdminLayout, EventCategoryForm, Redirect } from "@app/components";
import {
  EventCategory,
  useAdminLayoutQuery,
  useCreateEventCategoryMutation,
} from "@app/graphql";
import { getCodeFromError } from "@app/lib";
import * as Sentry from "@sentry/react";
import { Col, PageHeader, Row } from "antd";
import { NextPage } from "next";
import { NextRouter, useRouter } from "next/dist/client/router";
import useTranslation from "next-translate/useTranslation";
import { Store } from "rc-field-form/lib/interface";

const CreateEventCategoryPage: NextPage = () => {
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const query = useAdminLayoutQuery();
  const { t } = useTranslation("events");
  const router: NextRouter | null = useRouter();

  const code = getCodeFromError(formError);
  const [eventCategory, setEventCategory] = useState<null | Pick<
    EventCategory,
    "id"
  >>(null);
  const [createEventCategory] = useCreateEventCategoryMutation();

  const { defaultLanguage, supportedLanguages } = query.data?.languages || {};

  const handleSubmit = useCallback(
    async (values: Store) => {
      setFormError(null);
      try {
        const { name, description, organization } = values;
        const { data } = await createEventCategory({
          variables: {
            name,
            description,
            organization,
          },
        });
        setFormError(null);
        setEventCategory(data?.createEventCategory?.eventCategory || null);
      } catch (e) {
        setFormError(e);
        Sentry.captureException(e);
      }
    },
    [createEventCategory]
  );

  if (eventCategory) {
    return <Redirect href={`/admin/category/${eventCategory.id}`} layout />;
  }

  const organizationMemberships =
    query.data?.currentUser?.organizationMemberships?.nodes;
  if (organizationMemberships && organizationMemberships?.length <= 0) {
    return <Redirect href="/" layout />;
  }

  const org = router?.query?.org;
  const initialOrganization = organizationMemberships.find(
    (membership) => membership.organization.slug === org
  )?.organization?.id;

  console.log(initialOrganization);

  return (
    <AdminLayout
      href={`/admin/create-event-category${org ? `?org=${org}` : ""}`}
      query={query}
    >
      <Row>
        <Col flex={1}>
          <PageHeader title={t("createEventCategory.title")} />
          <div>
            {supportedLanguages ? (
              <EventCategoryForm
                code={code}
                defaultLanguages={[defaultLanguage]}
                formError={formError}
                handleSubmit={handleSubmit}
                initialValues={{
                  languages: [defaultLanguage],
                  organization: initialOrganization,
                }}
                organizationMemberships={organizationMemberships}
                supportedLanguages={supportedLanguages}
              />
            ) : (
              <p>Loading...</p>
            )}
          </div>
        </Col>
      </Row>
    </AdminLayout>
  );
};

export default CreateEventCategoryPage;
