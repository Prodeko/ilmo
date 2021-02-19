import React, { useState } from "react";
import { ApolloError } from "@apollo/client";
import { extractError, formItemLayout, tailFormItemLayout } from "@app/lib";
import { Alert, Button, Form, Input, Select } from "antd";
import { Store } from "antd/lib/form/interface";
import useTranslation from "next-translate/useTranslation";

const { Option } = Select;

export type EventCategoryFormProps = {
  handleSubmit: (store: Store) => Promise<void>;
  initialValues: Store | undefined;
  formError: Error | ApolloError | null;
  defaultLanguages: string[];
  supportedLanguages: string[];
  organizationMemberships?: { organization?: { name: string; id: string } }[];
  code: string;
};

export const EventCategoryForm = ({
  handleSubmit,
  initialValues,
  formError,
  defaultLanguages,
  supportedLanguages,
  organizationMemberships,
  code,
}: EventCategoryFormProps) => {
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    defaultLanguages
  );
  const { t } = useTranslation("events");
  const [form] = Form.useForm();

  return (
    <Form
      {...formItemLayout}
      form={form}
      initialValues={initialValues}
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
          placeholder={t("forms.placeholders.eventCategory.organizer")}
        >
          {organizationMemberships?.map((o) => (
            <Option key={o.organization?.id} value={o.organization?.id!}>
              {o.organization?.name}
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
        </Input.Group>
      </Form.Item>
      <Form.Item label={t("common:shortDescription")}>
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
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.eventCategory.provideDescription"),
                  },
                ]}
                noStyle
              >
                <Input.TextArea
                  data-cy={`createeventcategory-input-description-${l}`}
                  placeholder={t(`forms.placeholders.${l}`)}
                  style={i > 0 ? { marginTop: 5 } : undefined}
                />
              </Form.Item>
            ))
          )}
        </Input.Group>
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
          type="primary"
        >
          {t("common:create")}
        </Button>
      </Form.Item>
    </Form>
  );
};
