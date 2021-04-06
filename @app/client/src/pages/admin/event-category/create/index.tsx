import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import { AdminLayout, EventCategoryForm, Redirect } from "@app/components";
import {
  EventCategory,
  useCreateEventCategoryMutation,
  useSharedQuery,
} from "@app/graphql";
import { getCodeFromError } from "@app/lib";
import * as Sentry from "@sentry/react";
import { Col, PageHeader, Row } from "antd";
import { NextPage } from "next";
import { useRouter } from "next/dist/client/router";
import useTranslation from "next-translate/useTranslation";
import { Store } from "rc-field-form/lib/interface";

const CreateEventCategoryPage: NextPage = () => {
  // TODO: make EventCategoryForm more like EventRegistrationForm so the
  // boilerplate below can be reduced
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const query = useSharedQuery();
  const { t } = useTranslation("events");
  const router = useRouter();

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
    return (
      <Redirect href={`/admin/event-category/${eventCategory.id}`} layout />
    );
  }

  const organizationMemberships =
    query.data?.currentUser?.organizationMemberships?.nodes;
  if (organizationMemberships && organizationMemberships?.length <= 0) {
    return <Redirect href="/" layout />;
  }

  const org = router?.query?.org;
  const initialOrganization = organizationMemberships?.find(
    (membership) => membership.organization.slug === org
  )?.organization?.id;

  return (
    <AdminLayout
      href={`/admin/event-category/create${org ? `?org=${org}` : ""}`}
      query={query}
    >
      <Row>
        <Col flex={1}>
          <PageHeader
            title={t("createEventCategory.title")}
            onBack={() => router.push("/admin/event-category/list")}
          />
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
            <p>{t("common:loading")}</p>
          )}
        </Col>
      </Row>
    </AdminLayout>
  );
};

export default CreateEventCategoryPage;
