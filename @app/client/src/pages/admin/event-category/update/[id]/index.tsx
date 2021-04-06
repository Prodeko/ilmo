import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import {
  AdminLayout,
  EventCategoryForm,
  Redirect,
  useQueryId,
} from "@app/components";
import {
  useUpdateEventCategoryMutation,
  useUpdateEventCategoryPageQuery,
} from "@app/graphql";
import { getCodeFromError } from "@app/lib";
import * as Sentry from "@sentry/react";
import { Col, PageHeader, Row } from "antd";
import { NextPage } from "next";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";
import { Store } from "rc-field-form/lib/interface";

const UpdateEventCategoryPage: NextPage = () => {
  // TODO: make EventCategoryForm more like EventRegistrationForm so the
  // boilerplate below can be reduced
  const router = useRouter();
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const id = useQueryId();
  const query = useUpdateEventCategoryPageQuery({ variables: { id } });
  const { t } = useTranslation("events");

  const code = getCodeFromError(formError);
  const [updateEventCategory] = useUpdateEventCategoryMutation();

  const { supportedLanguages } = query.data?.languages || {};
  const defaultLanguages = Object.keys(query.data?.eventCategory.name || {});

  const handleSubmit = useCallback(
    async (values: Store) => {
      setFormError(null);
      try {
        const { name, description, organization } = values;
        await updateEventCategory({
          variables: {
            id,
            name,
            description,
            organization,
          },
        });
        setFormError(null);
        router.push("/admin/event-category/list", "/admin/event-category/list");
      } catch (e) {
        setFormError(e);
        Sentry.captureException(e);
      }
    },
    [updateEventCategory, id, router]
  );

  const organizationMemberships =
    query.data?.currentUser?.organizationMemberships?.nodes;
  if (organizationMemberships && organizationMemberships?.length <= 0) {
    return <Redirect href="/" layout />;
  }

  const initialValues: Store = query.data
    ? {
        name: query.data.eventCategory.name,
        languages: defaultLanguages,
        organization: query.data.eventCategory.ownerOrganization.id,
        description: query.data.eventCategory.description,
      }
    : {};

  return (
    <AdminLayout href={`/admin/event-category/${id}`} query={query}>
      <Row>
        <Col flex={1}>
          <PageHeader
            title={t("createEventCategory.title")}
            onBack={() => router.push("/admin/event-category/list")}
          />
          <div>
            {supportedLanguages ? (
              <EventCategoryForm
                code={code}
                defaultLanguages={defaultLanguages}
                formError={formError}
                handleSubmit={handleSubmit}
                initialValues={initialValues}
                organizationMemberships={organizationMemberships}
                supportedLanguages={supportedLanguages}
              />
            ) : (
              <p>{t("common:loading")}</p>
            )}
          </div>
        </Col>
      </Row>
    </AdminLayout>
  );
};

export default UpdateEventCategoryPage;
