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
  defaultLanguage: string;
  supportedLanguages: string[];
  organizationMemberships?: { organization?: { name: string; id: string } }[];
  code: string;
};

export const EventCategoryForm = ({
  handleSubmit,
  initialValues,
  formError,
  defaultLanguage,
  supportedLanguages,
  organizationMemberships,
  code,
}: EventCategoryFormProps) => {
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([
    defaultLanguage!,
  ]);
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
        >
          {supportedLanguages?.map((l, i) => (
            <Option key={i} value={l ? l : ""}>
              {t(`common:${l}`)}
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item
        name="organization"
        label={t("organizer")}
        rules={[
          {
            required: true,
            message: t("forms.rules.eventCategory.provideOrganizer"),
          },
        ]}
      >
        <Select
          placeholder={t("forms.placeholders.eventCategory.organizer")}
          data-cy="createeventcategory-select-organization-id"
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
                noStyle
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.eventCategory.provideName"),
                  },
                ]}
              >
                <Input
                  style={i > 0 ? { marginTop: 5 } : undefined}
                  placeholder={t(`forms.placeholders.${l}`)}
                  data-cy={`createeventcategory-input-name-${l}`}
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
                noStyle
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.eventCategory.provideDescription"),
                  },
                ]}
              >
                <Input.TextArea
                  style={i > 0 ? { marginTop: 5 } : undefined}
                  placeholder={t(`forms.placeholders.${l}`)}
                  data-cy={`createeventcategory-input-description-${l}`}
                />
              </Form.Item>
            ))
          )}
        </Input.Group>
      </Form.Item>
      {formError && (
        <Form.Item {...tailFormItemLayout}>
          <Alert
            type="error"
            message={t("errors.eventCategoryCreationFailed")}
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
        <Button htmlType="submit" data-cy="createeventcategory-button-create">
          {t("common:create")}
        </Button>
      </Form.Item>
    </Form>
  );
};
