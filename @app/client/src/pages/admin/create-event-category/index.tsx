import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import { AdminLayout, Redirect } from "@app/components";
import {
  CreatedEventCategoryFragment,
  useAdminLayoutQuery,
  useCreateEventCategoryMutation,
} from "@app/graphql";
import {
  extractError,
  formItemLayout,
  getCodeFromError,
  tailFormItemLayout,
} from "@app/lib";
import * as Sentry from "@sentry/react";
import { Alert, Button, Col, Form, Input, PageHeader, Row, Select } from "antd";
import { NextPage } from "next";
import { NextRouter, useRouter } from "next/dist/client/router";
import useTranslation from "next-translate/useTranslation";
import { Store } from "rc-field-form/lib/interface";

const { Option } = Select;
const { TextArea, Group } = Input;

const CreateEventCategoryPage: NextPage = () => {
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const query = useAdminLayoutQuery();
  const { t } = useTranslation("events");
  const [form] = Form.useForm();
  const router: NextRouter | null = useRouter();

  console.log(router.query);

  const code = getCodeFromError(formError);
  const [
    eventCategory,
    setEventCategory,
  ] = useState<null | CreatedEventCategoryFragment>(null);
  const [createEventCategory] = useCreateEventCategoryMutation();

  const { defaultLanguage, supportedLanguages } = query.data?.languages || {};
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([
    defaultLanguage!,
  ]);

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
    return <Redirect href="/" layout />;
  }

  const organizationMemberships =
    query.data?.currentUser?.organizationMemberships?.nodes;
  if (organizationMemberships && organizationMemberships?.length <= 0) {
    return <Redirect href="/" layout />;
  }

  console.log(organizationMemberships, router.query.org);

  const initialOrganization =
    router &&
    router.query &&
    router.query.org &&
    organizationMemberships &&
    organizationMemberships.length > 0 &&
    organizationMemberships.find(
      (membership) => membership.organization.slug === router.query.org
    )?.organization?.id;

  return (
    <AdminLayout
      href={`/admin/create-event-category${
        router?.query?.org ? `?org=${router.query.org}` : ""
      }`}
      query={query}
    >
      <Row>
        <Col flex={1}>
          <PageHeader title={t("createEventCategory.title")} />
          <div>
            <Form
              {...formItemLayout}
              form={form}
              initialValues={{ languages: [defaultLanguage] }}
              onFinish={handleSubmit}
            >
              <Form.Item
                label={t("languages")}
                name="languages"
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.provideLanguage"),
                    type: "array",
                  },
                ]}
              >
                <Select
                  mode="multiple"
                  placeholder={t("forms.placeholders.languages")}
                  allowClear
                  onChange={(e) => setSelectedLanguages(e as string[])}
                >
                  {supportedLanguages?.map((l, i) => (
                    <Option key={i} value={l ? l : ""}>
                      {t(`common:${l}`)}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                label={t("organizer")}
                name="organization"
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.eventCategory.provideOrganizer"),
                  },
                ]}
              >
                <Select
                  data-cy="createeventcategory-select-organization-id"
                  defaultValue={initialOrganization}
                >
                  {organizationMemberships?.map((o) => (
                    <Option key={o.organization?.id} value={o.organization?.id}>
                      {o.organization?.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label={t("common:name")}>
                <Group compact>
                  {selectedLanguages.length === 0 ? (
                    <Form.Item noStyle>
                      <Input disabled />
                    </Form.Item>
                  ) : (
                    selectedLanguages.map((l, i) => (
                      <Form.Item
                        key={l}
                        name={["name", l]}
                        rules={[
                          {
                            required: true,
                            message: t("forms.rules.eventCategory.provideName"),
                          },
                        ]}
                        noStyle
                      >
                        <Input
                          data-cy={`createeventcategory-input-name-${l}`}
                          placeholder={t(`forms.placeholders.${l}`)}
                          style={i > 0 ? { marginTop: 5 } : undefined}
                        />
                      </Form.Item>
                    ))
                  )}
                </Group>
              </Form.Item>
              <Form.Item label={t("common:shortDescription")}>
                <Group compact>
                  {selectedLanguages.length === 0 ? (
                    <Form.Item noStyle>
                      <TextArea disabled />
                    </Form.Item>
                  ) : (
                    selectedLanguages.map((l, i) => (
                      <Form.Item
                        key={l}
                        name={["description", l]}
                        rules={[
                          {
                            required: true,
                            message: t(
                              "forms.rules.eventCategory.provideDescription"
                            ),
                          },
                        ]}
                        noStyle
                      >
                        <TextArea
                          data-cy={`createeventcategory-input-description-${l}`}
                          placeholder={t(`forms.placeholders.${l}`)}
                          style={i > 0 ? { marginTop: 5 } : undefined}
                        />
                      </Form.Item>
                    ))
                  )}
                </Group>
              </Form.Item>
              {formError && (
                <Form.Item {...tailFormItemLayout}>
                  <Alert
                    description={
                      <span>
                        {extractError(formError).message}
                        {code && (
                          <span>
                            ({t("error:errorCode")}: <code>ERR_{code}</code>)
                          </span>
                        )}
                      </span>
                    }
                    message={t("errors.eventCategoryCreationFailed")}
                    type="error"
                  />
                </Form.Item>
              )}
              <Form.Item {...tailFormItemLayout}>
                <Button
                  data-cy="createeventcategory-button-create"
                  htmlType="submit"
                >
                  {t("common:create")}
                </Button>
              </Form.Item>
            </Form>
          </div>
        </Col>
      </Row>
    </AdminLayout>
  );
};

export default CreateEventCategoryPage;
