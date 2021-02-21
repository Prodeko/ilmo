import React, { useCallback, useMemo, useState } from "react";
import {
  ApolloError,
  DocumentNode,
  QueryResult,
  useMutation,
} from "@apollo/client";
import {
  CreateEventPage_QueryFragment,
  UpdateEventPage_QueryFragment,
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
  Row,
  Select,
  Switch,
  Tabs,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { debounce } from "lodash";
import { useRouter } from "next/router";
import useTranslation from "next-translate/useTranslation";
import slugify from "slugify";

import { FileUpload, Redirect } from "./index";

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

interface EventFormProps {
  type: "update" | "create";
  formRedirect: string;
  dataQuery: Pick<
    QueryResult<CreateEventPage_QueryFragment | UpdateEventPage_QueryFragment>,
    "data" | "loading" | "error" | "called"
  >;
  formMutationDocument: DocumentNode;
  // eventId and initialValues are only used when type is "update"
  // i.e. we are updating an existing event
  eventId?: string;
  initialValues?: any;
}

function getFormattedEventTime(dates?: Date[]) {
  const formatString = "D.M.YY HH:mm";
  const eventStartTime = dayjs(dates?.[0]).format(formatString);
  const eventEndTime = dayjs(dates?.[1]).format(formatString);
  return `${eventStartTime} - ${eventEndTime}`;
}

function getEventSlug(name?: FormValueName, dates?: Date[]) {
  const eventStartTime = dates?.[0].toISOString();

  const daySlug = dayjs(eventStartTime).format("YYYY-M-D");
  const slug = slugify(`${daySlug}-${name?.["fi"]}`, {
    lower: true,
  });

  return name?.fi ? slug : "";
}

export const EventForm: React.FC<EventFormProps> = (props) => {
  const {
    formRedirect,
    dataQuery,
    initialValues,
    formMutationDocument,
    type,
    eventId,
  } = props;
  const { data, loading, called } = dataQuery;
  const { supportedLanguages } = data?.languages || {};

  const { t, lang } = useTranslation("events");
  const router = useRouter();

  // Handling form values, errors and submission
  const [form] = Form.useForm();
  const [formValues, setFormValues] = useState<FormValues | undefined>();
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const [formQuery] = useMutation(formMutationDocument, {
    context: { hasUpload: true },
  });
  const [selectedLanguages, setSelectedLanguages] = useState(
    supportedLanguages || []
  );

  const code = getCodeFromError(formError);

  // For rendering email tab
  const [showHtml, setShowHtml] = useState(true);
  const {
    loading: templatesLoading,
    data: emailTemplatesData,
  } = useRenderEmailTemplateQuery({
    variables: {
      template: "event_registration.mjml.njk",
      variables: {
        registrationName: "{{ registrationName }}",
        registrationQuota: {
          fi: "{{ registrationQuota }}",
          en: "{{ registrationQuota }}",
        },
        eventName: formValues?.name,
        eventTime: getFormattedEventTime(formValues?.eventTime) || "",
        eventLink: `${process.env.ROOT_URL}/${getEventSlug(
          formValues?.name,
          formValues?.eventTime
        )}`,
        eventRegistrationDeleteLink: "{{ eventRegistrationDeleteLink }}",
      },
    },
  });

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
        const eventStartTime = values.eventTime[0].toISOString();
        const eventEndTime = values.eventTime[1].toISOString();

        const registrationStartTime = values.registrationTime[0].toISOString();
        const registrationEndTime = values.registrationTime[1].toISOString();

        const slug = getEventSlug(values.name, values.eventTime);
        const headerImageFile = values?.headerImageFile?.file?.originFileObj;

        // eventId is only used in update mutation
        await formQuery({
          variables: {
            ...values,
            slug,
            eventStartTime,
            eventEndTime,
            registrationStartTime,
            registrationEndTime,
            headerImageFile,
            eventId,
          },
        });
        setFormError(null);
        router.push(formRedirect, formRedirect);
      } catch (e) {
        setFormError(e);
        Sentry.captureException(e);
      }
    },
    [formQuery, formRedirect, router, eventId]
  );

  // Redirect to index if the user is not part of any organization
  const organizationMemberships =
    data?.currentUser?.organizationMemberships?.nodes;
  if (
    called &&
    !loading &&
    organizationMemberships &&
    organizationMemberships?.length <= 0
  ) {
    return <Redirect href="/" layout />;
  }

  return (
    <Form
      {...formItemLayout}
      form={form}
      initialValues={{ languages: selectedLanguages, ...initialValues }}
      onFinish={handleSubmit}
      onValuesChange={handleValuesChange}
    >
      <Tabs defaultActiveKey="general">
        <TabPane
          key="general"
          data-cy="eventform-tab-general"
          tab={t("forms.tabs.generalInfo")}
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
              data-cy="eventform-select-language"
              mode="multiple"
              placeholder={t("forms.placeholders.languages")}
              allowClear
              onChange={(e) => setSelectedLanguages(e as string[])}
            >
              {supportedLanguages?.map((l, i) => (
                <Option
                  key={i}
                  data-cy={`eventform-select-language-option-${l}`}
                  value={l ? l : ""}
                >
                  {t(`common:${l}`)}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label={t("organizer")}
            name="organizationId"
            rules={[
              {
                required: true,
                message: t("forms.rules.event.provideOrganizer"),
              },
            ]}
          >
            <Select
              data-cy="eventform-select-organization-id"
              placeholder={t("forms.placeholders.event.organizer")}
            >
              {organizationMemberships?.map((a, i) => (
                <Option
                  key={a.organization?.id}
                  data-cy={`eventform-select-organization-id-option-${i}`}
                  value={a.organization?.id}
                >
                  {a.organization?.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label={t("category")}
            name="categoryId"
            rules={[
              {
                required: true,
                message: t("forms.rules.event.provideCategory"),
              },
            ]}
          >
            <Select
              data-cy="eventform-select-category-id"
              placeholder={t("forms.placeholders.event.category")}
            >
              {
                // @ts-ignore
                data?.eventCategories?.nodes.map((a, i) => (
                  <Option
                    key={a.id}
                    data-cy={`eventform-select-category-id-option-${i}`}
                    value={a.id}
                  >
                    {a.name[lang]}
                  </Option>
                ))
              }
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
                    name={["name", l!]}
                    rules={[
                      {
                        required: true,
                        message: t("forms.rules.event.provideName"),
                      },
                    ]}
                    noStyle
                  >
                    <Input
                      data-cy={`eventform-input-name-${l}`}
                      placeholder={t(`forms.placeholders.${l}`)}
                      style={i > 0 ? { marginTop: 5 } : undefined}
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
                    name={["description", l!]}
                    rules={[
                      {
                        required: true,
                        message: t("forms.rules.event.provideDescription"),
                      },
                    ]}
                    noStyle
                  >
                    <TextArea
                      data-cy={`eventform-input-description-${l}`}
                      placeholder={t(`forms.placeholders.${l}`)}
                      style={i > 0 ? { marginTop: 5 } : undefined}
                    />
                  </Form.Item>
                ))
              )}
            </Group>
          </Form.Item>
          <Form.Item
            label={t("forms.eventTime")}
            name="eventTime"
            rules={[
              {
                type: "array",
                required: true,
                message: t("forms.rules.event.provideEventTime"),
              },
            ]}
          >
            <RangePicker
              data-cy="eventform-input-event-time"
              format="YYYY-MM-DD HH:mm"
              showTime
            />
          </Form.Item>
          <Form.Item
            label={t("forms.registrationTime")}
            name="registrationTime"
            rules={[
              {
                type: "array",
                required: true,
                message: t("forms.rules.event.provideRegistrationTime"),
              },
            ]}
          >
            <RangePicker
              data-cy="eventform-input-registration-time"
              format="YYYY-MM-DD HH:mm"
              showTime
            />
          </Form.Item>
          <Form.Item
            label={t("forms.highlightEvent")}
            name="isHighlighted"
            valuePropName="checked"
          >
            <Switch data-cy="eventform-switch-highlight" />
          </Form.Item>
          <Form.Item
            label={t("headerImage")}
            name="headerImageFile"
            valuePropName="headerImageFile"
          >
            <FileUpload
              accept="image/*"
              cropAspect={851 / 315}
              data-cy="eventform-header-image-upload"
              maxCount={1}
            />
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
                message={t("errors.eventCreationFailed")}
                type="error"
              />
            </Form.Item>
          )}
          <Form.Item {...tailFormItemLayout}>
            <Button data-cy="eventform-button-submit" htmlType="submit">
              {t(`common:${type}`)}
            </Button>
          </Form.Item>
        </TabPane>
        <TabPane
          key="email"
          data-cy="eventform-tab-email"
          tab={t("forms.tabs.email")}
        >
          <Row>
            <Col span={24}>
              <Switch
                loading={templatesLoading}
                style={{ margin: 10 }}
                defaultChecked
                onChange={(checked) => setShowHtml(checked)}
              />
              <Text>{t("common:emailSwitchLabel")}</Text>
              <Card loading={templatesLoading} style={{ marginLeft: 10 }}>
                {showHtml ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: emailTemplatesData?.renderEmailTemplate?.html!,
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
  );
};
