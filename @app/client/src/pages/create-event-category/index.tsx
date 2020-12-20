import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import { AuthRestrict, Redirect, SharedLayout } from "@app/components";
import {
  CreatedEventCategoryFragment,
  useCreateEventCategoryMutation,
  useSharedQuery,
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
  Checkbox,
  Col,
  Form,
  Input,
  PageHeader,
  Row,
  Select,
} from "antd";
import { NextPage } from "next";
import { Store } from "rc-field-form/lib/interface";

const { Option } = Select;

const CreateEventCategoryPage: NextPage = () => {
  const [formError, setFormError] = useState<Error | ApolloError | null>(null);
  const query = useSharedQuery();
  const [form] = Form.useForm();

  const code = getCodeFromError(formError);
  const [
    eventCategory,
    setEventCategory,
  ] = useState<null | CreatedEventCategoryFragment>(null);
  const [createEventCategory] = useCreateEventCategoryMutation();

  const handleSubmit = useCallback(
    async (values: Store) => {
      setFormError(null);
      try {
        const { name, description, organization, is_public } = values;
        const { data } = await createEventCategory({
          variables: {
            name,
            desc: description,
            org_id: organization,
            is_public: !!is_public,
          },
        });
        setFormError(null);
        setEventCategory(data?.createEventCategory?.eventCategory || null);
      } catch (e) {
        setFormError(e);
      }
    },
    [createEventCategory]
  );

  if (eventCategory) {
    return <Redirect layout href="/" />;
  }

  const organizationMemberships =
    query.data?.currentUser?.organizationMemberships?.nodes;
  if (organizationMemberships && organizationMemberships?.length <= 0) {
    return <Redirect layout href="/" />;
  }

  return (
    <SharedLayout title="" query={query} forbidWhen={AuthRestrict.LOGGED_OUT}>
      <Row>
        <Col flex={1}>
          <PageHeader title="Create Event Category" />
          <div>
            <Form {...formItemLayout} form={form} onFinish={handleSubmit}>
              <Form.Item
                label="Organization"
                name="organization"
                rules={[
                  {
                    required: true,
                    message:
                      "Please choose a host organization for the event category",
                  },
                ]}
              >
                <Select
                  placeholder="Please select a host organization for the event category"
                  data-cy="createeventcategory-select-organization-id"
                >
                  {organizationMemberships?.map((a) => (
                    <Option value={a.organization?.id} key={a.organization?.id}>
                      {a.organization?.name}
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
                    message: "Please choose a name for the event category",
                  },
                ]}
              >
                <Input data-cy="createeventcategory-input-name" />
              </Form.Item>
              <Form.Item
                label="Short description"
                name="description"
                rules={[
                  {
                    required: true,
                    message: "Please tell something about the event category",
                  },
                ]}
              >
                <Input.TextArea data-cy="createeventcategory-input-description" />
              </Form.Item>
              <Form.Item name="is_public" valuePropName="checked">
                <Checkbox
                  data-cy="createeventcategory-checkbox-public"
                  defaultChecked={true}
                >
                  Public
                </Checkbox>
              </Form.Item>
              {formError ? (
                <Form.Item {...tailFormItemLayout}>
                  <Alert
                    type="error"
                    message={`Creating event category failed`}
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

export default CreateEventCategoryPage;
