import React, { useCallback, useMemo, useState } from "react";
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
  useRenderEmailTemplateQuery,
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
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  PageHeader,
  Row,
  Select,
  Switch,
  Tabs,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { debounce } from "lodash";
import { NextPage } from "next";
import useTranslation from "next-translate/useTranslation";
import slugify from "slugify";

const { Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { TextArea, Group } = Input;
const { RangePicker } = DatePicker;

type FormValueName = {
  fi: string;
  en: string;
};

type FormValues = {
  name: FormValueName;
  eventTime: Date[];
};

function getFormattedEventTime(dates: Date[]) {
  const formatString = "D.M.YY HH:mm";
  const startTime = dayjs(dates?.[0]).format(formatString);
  const endTime = dayjs(dates?.[1]).format(formatString);
  return `${startTime} - ${endTime}`;
}

function getEventSlug(name: FormValueName, dates: Date[]) {
  const startTime = dates?.[0].toISOString();

  const daySlug = dayjs(startTime).format("YYYY-M-D");
  const slug = slugify(`${daySlug}-${name?.["fi"]}`, {
    lower: true,
  });

  return name?.fi ? slug : "";
}

const CreateEventPage: NextPage = () => {
  const { t, lang } = useTranslation("events");
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const query = useEventCategoriesQuery();

  const [formValues, setFormValues] = useState<FormValues | undefined>();
  const [showHtml, setShowHtml] = useState(true);
  const {
    loading: templatesLoading,
    data: emailTemplatesData,
  } = useRenderEmailTemplateQuery({
    variables: {
      template: "event_registration.mjml",
      variables: {
        eventNameFi: formValues?.name?.fi || "",
        eventNameEn: formValues?.name?.en || "",
        registrationName: "[[registrationName]]",
        registrationQuotaFi: "[[registrationQuotaFi]]",
        registrationQuotaEn: "[[registrationQuotaFi]]",
        eventTime: getFormattedEventTime(formValues?.eventTime) || "",
        eventLink: `${process.env.ROOT_URL}/${getEventSlug(
          formValues?.name,
          formValues?.eventTime
        )}`,
        eventRegistrationDeleteLink: "[[eventRegistrationDeleteLink]]",
      },
    },
  });

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

  const debouncedSetFormValues = useMemo(
    () => debounce((newValues) => setFormValues(newValues), 500),
    []
  );

  const handleValuesChange = useCallback(
    async (_changedValues, allValues) => {
      debouncedSetFormValues(allValues);
    },
    [debouncedSetFormValues]
  );

  const handleSubmit = useCallback(
    async (values) => {
      setFormError(null);
      try {
        const startTime = values.eventTime[0].toISOString();
        const endTime = values.eventTime[1].toISOString();

        const slug = getEventSlug(values.name, values.eventTime);
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

  // Redirect to index if the user is not part of any organization
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
              onValuesChange={handleValuesChange}
            >
              <Tabs defaultActiveKey="general">
                <TabPane
                  data-cy="createevent-tab-general"
                  tab={t("forms.tabs.generalInfo")}
                  key="general"
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
                    </Group>
                  </Form.Item>
                  <Form.Item label={t("common:description")}>
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
                            noStyle
                            rules={[
                              {
                                required: true,
                                message: t(
                                  "forms.rules.event.provideDescription"
                                ),
                              },
                            ]}
                          >
                            <TextArea
                              style={i > 0 ? { marginTop: 5 } : undefined}
                              placeholder={t(`forms.placeholders.${l}`)}
                              data-cy={`createevent-input-description-${l}`}
                            />
                          </Form.Item>
                        ))
                      )}
                    </Group>
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
                                ({t("error:errorCode")}: <code>ERR_{code}</code>
                                )
                              </span>
                            )}
                          </span>
                        }
                      />
                    </Form.Item>
                  )}
                  <Form.Item {...tailFormItemLayout}>
                    <Button
                      htmlType="submit"
                      data-cy="createevent-button-create"
                    >
                      {t("common:create")}
                    </Button>
                  </Form.Item>
                </TabPane>
                <TabPane
                  data-cy="createevent-tab-email"
                  tab={t("forms.tabs.email")}
                  key="email"
                >
                  <Row>
                    <Col xs={{ span: 24 }} sm={{ span: 24 }}>
                      <Switch
                        defaultChecked
                        onChange={(checked) => setShowHtml(checked)}
                        loading={templatesLoading}
                        style={{ margin: 10 }}
                      />
                      <Text>{t("common:emailSwitchLabel")}</Text>
                      <Card
                        style={{ marginLeft: 10 }}
                        loading={templatesLoading}
                      >
                        {showHtml ? (
                          <div
                            dangerouslySetInnerHTML={{
                              __html:
                                emailTemplatesData?.renderEmailTemplate?.html,
                            }}
                          />
                        ) : (
                          <Text style={{ whiteSpace: "pre-wrap" }}>
                            {emailTemplatesData?.renderEmailTemplate?.text}
                          </Text>
                        )}
                      </Card>
                    </Col>
                  </Row>
                </TabPane>
              </Tabs>
            </Form>
          </div>
        </Col>
      </Row>
    </SharedLayout>
  );
};

export default CreateEventPage;
