import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import {
  AuthRestrict,
  FileUpload,
  Redirect,
  SharedLayout,
} from "@app/components";
import {
  CreatedEventFragment,
  useCreateEventMutation,
  useEventCategoriesQuery,
} from "@app/graphql";
import {
  extractError,
  formItemLayout,
  getCodeFromError,
  tailFormItemLayout,
} from "@app/lib";
import * as Sentry from "@sentry/react";
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  PageHeader,
  Row,
  Select,
  Switch,
} from "antd";
import dayjs from "dayjs";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";
import slugify from "slugify";

const { Option } = Select;
const { RangePicker } = DatePicker;

const CreateEventPage: NextPage = () => {
  const { t, lang } = useTranslation("events");
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const query = useEventCategoriesQuery();
  const [form] = Form.useForm();

  const code = getCodeFromError(formError);
  const [event, setEvent] = useState<null | CreatedEventFragment>(null);
  const [createEvent] = useCreateEventMutation({
    context: { hasUpload: true },
  });

  const { defaultLanguage, supportedLanguages } = query.data?.languages || {};
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([
    defaultLanguage!,
  ]);

  const handleSubmit = useCallback(
    async (values) => {
      setFormError(null);
      try {
        const startTime = values.eventTime[0].toISOString();
        const endTime = values.eventTime[1].toISOString();

        const daySlug = dayjs(startTime).format("YYYY-M-D");
        const slug = slugify(`${daySlug}-${values.name["fi"]}`, {
          lower: true,
        });
        const headerImageFile = values?.headerImageFile?.file?.originFileObj;

        const { data } = await createEvent({
          variables: {
            ...values,
            slug,
            startTime,
            endTime,
            headerImageFile,
          },
        });
        setFormError(null);
        setEvent(data?.createEvent?.event || null);
      } catch (e) {
        setFormError(e);
        Sentry.captureException(e);
      }
    },
    [createEvent]
  );

  if (event) {
    return <Redirect layout href="/" />;
  }

  const organizationMemberships =
    query.data?.currentUser?.organizationMemberships?.nodes;
  if (
    query.called &&
    !query.loading &&
    organizationMemberships &&
    organizationMemberships?.length <= 0
  ) {
    return <Redirect layout href="/" />;
  }

  return (
    <SharedLayout title="" query={query} forbidWhen={AuthRestrict.LOGGED_OUT}>
      <Row>
        <Col flex={1}>
          <PageHeader title={t("createEvent.title")} />
          <div>
            <Form
              {...formItemLayout}
              form={form}
              initialValues={{ languages: [defaultLanguage] }}
              onFinish={handleSubmit}
            >
              <Form.Item
                name="languages"
                label={t("languages")}
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
                  allowClear
                  onChange={(e) => setSelectedLanguages(e as string[])}
                  placeholder={t("forms.placeholders.languages")}
                  data-cy="createevent-select-language"
                >
                  {supportedLanguages?.map((l, i) => (
                    <Option
                      key={i}
                      value={l ? l : ""}
                      data-cy={`createevent-select-language-option-${l}`}
                    >
                      {t(`common:${l}`)}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="organizationId"
                label={t("organizer")}
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.event.provideOrganizer"),
                  },
                ]}
              >
                <Select
                  placeholder={t("forms.placeholders.event.organizer")}
                  data-cy="createevent-select-organization-id"
                >
                  {organizationMemberships?.map((a, i) => (
                    <Option
                      value={a.organization?.id}
                      key={a.organization?.id}
                      data-cy={`createevent-select-organization-id-option-${i}`}
                    >
                      {a.organization?.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="categoryId"
                label={t("category")}
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.event.provideCategory"),
                  },
                ]}
              >
                <Select
                  placeholder={t("forms.placeholders.event.category")}
                  data-cy="createevent-select-category-id"
                >
                  {query.data?.eventCategories?.nodes.map((a, i) => (
                    <Option
                      value={a.id}
                      key={a.id}
                      data-cy={`createevent-select-category-id-option-${i}`}
                    >
                      {a.name[lang]}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label={t("common:name")}>
                <Input.Group compact>
                  {selectedLanguages.length === 0 ? (
                    <Form.Item noStyle>
                      <Input disabled />
                    </Form.Item>
                  ) : (
                    selectedLanguages.map((l, i) => (
                      <Form.Item
                        key={l}
                        name={["name", l]}
                        noStyle
                        rules={[
                          {
                            required: true,
                            message: t("forms.rules.event.provideName"),
                          },
                        ]}
                      >
                        <Input
                          style={i > 0 ? { marginTop: 5 } : undefined}
                          placeholder={t(`forms.placeholders.${l}`)}
                          data-cy={`createevent-input-name-${l}`}
                        />
                      </Form.Item>
                    ))
                  )}
                </Input.Group>
              </Form.Item>
              <Form.Item label={t("common:description")}>
                <Input.Group compact>
                  {selectedLanguages.length === 0 ? (
                    <Form.Item noStyle>
                      <Input.TextArea disabled />
                    </Form.Item>
                  ) : (
                    selectedLanguages.map((l, i) => (
                      <Form.Item
                        key={l}
                        name={["description", l]}
                        noStyle
                        rules={[
                          {
                            required: true,
                            message: t("forms.rules.event.provideDescription"),
                          },
                        ]}
                      >
                        <Input.TextArea
                          style={i > 0 ? { marginTop: 5 } : undefined}
                          placeholder={t(`forms.placeholders.${l}`)}
                          data-cy={`createevent-input-description-${l}`}
                        />
                      </Form.Item>
                    ))
                  )}
                </Input.Group>
              </Form.Item>
              <Form.Item
                name="eventTime"
                label={t("forms.eventTime")}
                rules={[
                  {
                    type: "array",
                    required: true,
                    message: t("forms.rules.event.provideEventTime"),
                  },
                ]}
              >
                <RangePicker
                  showTime
                  format="YYYY-MM-DD HH:mm"
                  data-cy="createevent-input-rangepicker"
                />
              </Form.Item>
              <Form.Item
                name="isHighlighted"
                label={t("forms.highlightEvent")}
                valuePropName="checked"
              >
                <Switch data-cy="createevent-switch-highlight" />
              </Form.Item>
              <Form.Item
                name="headerImageFile"
                label={t("headerImage")}
                valuePropName="headerImageFile"
              >
                <FileUpload
                  accept="image/*"
                  maxCount={1}
                  cropAspect={851 / 315}
                  data-cy="createevent-header-image-upload"
                />
              </Form.Item>
              {formError && (
                <Form.Item {...tailFormItemLayout}>
                  <Alert
                    type="error"
                    message={t("errors.eventCreationFailed")}
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
                  />
                </Form.Item>
              )}
              <Form.Item {...tailFormItemLayout}>
                <Button htmlType="submit" data-cy="createevent-button-create">
                  {t("common:create")}
                </Button>
              </Form.Item>
            </Form>
          </div>
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default CreateEventPage;
