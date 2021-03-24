import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import {
  AdminLayout,
  ButtonLink,
  EventCategoryForm,
  Redirect,
  useAdminCategoryId,
} from "@app/components";
import {
  useAdminCategoryQuery,
  useUpdateEventCategoryMutation,
} from "@app/graphql";
import { getCodeFromError } from "@app/lib";
import * as Sentry from "@sentry/react";
import { Col, PageHeader, Row } from "antd";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";
import { Store } from "rc-field-form/lib/interface";

const CreateEventCategoryPage: NextPage = () => {
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const id = useAdminCategoryId();
  const query = useAdminCategoryQuery({ variables: { id } });
  const { t } = useTranslation("events");

  const code = getCodeFromError(formError);
  const [eventCategoryId, setEventCategoryId] = useState<null | string>(null);
  const [updateEventCategory] = useUpdateEventCategoryMutation();

  const { supportedLanguages } = query.data?.languages || {};
  const defaultLanguages = Object.keys(query.data?.eventCategory.name || {});

  const handleSubmit = useCallback(
    async (values: Store) => {
      setFormError(null);
      try {
        const { name, description, organization } = values;
        const { data } = await updateEventCategory({
          variables: {
            id,
            name,
            description,
            organization,
          },
        });
        setFormError(null);
        setEventCategoryId(data?.updateEventCategory?.eventCategory.id || null);
      } catch (e) {
        setFormError(e);
        Sentry.captureException(e);
      }
    },
    [updateEventCategory, id]
  );

  if (eventCategoryId) {
    return <Redirect href={`/admin/category/${eventCategoryId}`} layout />;
  }

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
    <AdminLayout href={`/admin/category/${id}`} query={query}>
      <Row>
        <Col flex={1}>
          <PageHeader
            extra={[
              <ButtonLink
                key="update-back"
                as={`/admin/category/${id}`}
                data-cy="admin-update-back-wo-saving"
                href="/admin/category/[id]"
                type="default"
              >
                {t("admin:backWithoutSaving")}
              </ButtonLink>,
            ]}
            title={t("createEventCategory.title")}
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
              <p>Loading...</p>
            )}
          </div>
        </Col>
      </Row>
    </AdminLayout>
  );
};

export default CreateEventCategoryPage;
