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
} from "antd";
import { NextPage } from "next";

const { RangePicker } = DatePicker;

const CreateEventPage: NextPage = () => {
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
        const { data } = await createEvent({
          variables: {
            ...values,
            startTime: values["eventTime"][0].toISOString(),
            endTime: values["eventTime"][1].toISOString(),
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
          <PageHeader title="Create Event" />
          <div>
            <Form {...formItemLayout} form={form} onFinish={handleSubmit}>
              <Form.Item
                label="Organization"
                name="organizationId"
                rules={[
                  {
                    required: true,
                    message: "Please choose an organizer for the event",
                  },
                ]}
              >
                <Select
                  placeholder="Please select an organizer for the event"
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
                label="Category"
                name="categoryId"
                rules={[
                  {
                    required: true,
                    message: "Please choose an category for the event",
                  },
                ]}
              >
                <Select
                  placeholder="Please select an organizer for the event"
                  data-cy="createevent-select-category-id"
                >
                  {query.data?.eventCategories?.nodes.map((a) => (
                    <Select.Option value={a.id} key={a.id}>
                      {a.isPublic ? "Public" : "Hidden"} {a.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                label="Name"
                name="name"
                rules={[
                  {
                    required: true,
                    message: "Please choose a name for the event",
                  },
                ]}
              >
                <Input data-cy="createevent-input-name" />
              </Form.Item>
              <Form.Item
                label="Description"
                name="description"
                rules={[
                  {
                    required: true,
                    message: "Please tell something about the event",
                  },
                ]}
              >
                <Input.TextArea data-cy="createevent-input-description" />
              </Form.Item>
              <Form.Item
                name="eventTime"
                label="Event time"
                rules={[
                  {
                    type: "array",
                    required: true,
                    message: "Please select time!",
                  },
                ]}
              >
                <RangePicker showTime format="YYYY-MM-DD HH:mm" />
              </Form.Item>
              {formError ? (
                <Form.Item {...tailFormItemLayout}>
                  <Alert
                    type="error"
                    message={`Creating event failed`}
                    description={
                      <span>
                        {extractError(formError).message}
                        {code ? (
                          <span>
                            {" "}
                            (Error code: <code>ERR_{code}</code>)
                          </span>
                        ) : null}
                      </span>
                    }
                  />
                </Form.Item>
              ) : null}
              <Form.Item {...tailFormItemLayout}>
                <Button htmlType="submit" data-cy="createevent-button-create">
                  Create
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
