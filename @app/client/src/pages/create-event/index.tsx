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
import { ApolloError } from "@apollo/client";
import { NextPage } from "next";
import { Store } from "rc-field-form/lib/interface";
import React, { useCallback, useState } from "react";

const { Option } = Select;

const CreateEventPage: NextPage = () => {
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const query = useEventCategoriesQuery();
  const [form] = Form.useForm();

  const code = getCodeFromError(formError);
  const [event, setEvent] = useState<null | CreatedEventFragment>(null);
  const [createEvent] = useCreateEventMutation();
  const handleSubmit = useCallback(
    async (values: Store) => {
      console.log(values);
      setFormError(null);
      try {
        console.log(values);
        const { name, description, organization, category, datetime } = values;
        const { data } = await createEvent({
          variables: {
            name,
            desc: description,
            org_id: organization,
            cat_id: category,
            datetime: datetime.toISOString(),
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

  if (
    query.called &&
    !query.loading &&
    (!query.data?.currentUser?.organizationMemberships.nodes.length ||
      query.data?.currentUser?.organizationMemberships.nodes.length <= 0)
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
                name="organization"
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
                  {query.data?.currentUser?.organizationMemberships.nodes.map(
                    (a) => (
                      <Option
                        value={a.organization?.id}
                        key={a.organization?.id}
                      >
                        {a.organization?.name}
                      </Option>
                    )
                  )}
                </Select>
              </Form.Item>
              <Form.Item
                label="Category"
                name="category"
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
                    <Option value={a.id} key={a.id}>
                      {a.isPublic ? "Public" : "Hidden"} {a.name}
                    </Option>
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
                name="datetime"
                label="Choose time"
                rules={[
                  {
                    type: "object",
                    required: true,
                    message: "Please select time!",
                  },
                ]}
              >
                <DatePicker showTime format="YYYY-MM-DD HH:mm" />
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
