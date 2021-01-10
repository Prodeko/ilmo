import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import { AuthRestrict, Redirect, SharedLayout } from "@app/components";
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

const { RangePicker } = DatePicker;

const CreateEventPage: NextPage = () => {
  const { t } = useTranslation("events");
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const query = useEventCategoriesQuery();
  const [form] = Form.useForm();

  const code = getCodeFromError(formError);
  const [event, setEvent] = useState<null | CreatedEventFragment>(null);
  const [createEvent] = useCreateEventMutation();

  const handleSubmit = useCallback(
    async (values) => {
      setFormError(null);
      try {
        const startTime = values["eventTime"][0].toISOString();
        const endTime = values["eventTime"][1].toISOString();

        const daySlug = dayjs(startTime).format("YYYY-M-D");
        const slug = slugify(`${daySlug}-${values.name}`, {
          lower: true,
        });

        const { data } = await createEvent({
          variables: {
            ...values,
            slug,
            startTime,
            endTime,
          },
        });
        setFormError(null);
        setEvent(data?.createEvent?.event || null);
      } catch (e) {
        setFormError(e);
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
            <Form {...formItemLayout} form={form} onFinish={handleSubmit}>
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
                  {organizationMemberships?.map((a) => (
                    <Select.Option
                      value={a.organization?.id}
                      key={a.organization?.id}
                    >
                      {a.organization?.name}
                    </Select.Option>
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
                  {query.data?.eventCategories?.nodes.map((a) => (
                    <Select.Option value={a.id} key={a.id}>
                      {a.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="name"
                label={t("common:name")}
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.event.provideName"),
                  },
                ]}
              >
                <Input data-cy="createevent-input-name" />
              </Form.Item>
              <Form.Item
                name="description"
                label={t("common:description")}
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.event.provideDescription"),
                  },
                ]}
              >
                <Input.TextArea data-cy="createevent-input-description" />
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
                <RangePicker showTime format="YYYY-MM-DD HH:mm" />
              </Form.Item>
              <Form.Item
                name="isHighlighted"
                label={t("forms.highlightEvent")}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              {formError ? (
                <Form.Item {...tailFormItemLayout}>
                  <Alert
                    type="error"
                    message={t("errors.eventCreationFailed")}
                    description={
                      <span>
                        {extractError(formError).message}
                        {code ? (
                          <span>
                            {" "}
                            ({t("error:errorCode")}: <code>ERR_{code}</code>)
                          </span>
                        ) : null}
                      </span>
                    }
                  />
                </Form.Item>
              ) : null}
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
