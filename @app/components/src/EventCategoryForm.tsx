import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CreateEventCategoryDocument,
  SharedQuery,
  UpdateEventCategoryDocument,
  UpdateEventCategoryPageQuery,
} from "@app/graphql"
import {
  filterObjectByKeys,
  formItemLayout,
  tailFormItemLayout,
} from "@app/lib"
import { Button, Form, Input, Select } from "antd"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"
import { CombinedError, useMutation } from "urql"

import { ColorPicker } from "./ColorPicker"
import { ErrorAlert } from "./ErrorAlert"

const { Option } = Select

interface EventCategoryFormProps {
  type: "update" | "create"
  data: SharedQuery | UpdateEventCategoryPageQuery
  formRedirect: { pathname: string; query: { [key: string]: string } } | string
  // categoryId and initialValues are used when type is "update"
  // i.e. we are updating an existing event category
  categoryId?: string
  initialValues?: any
}

export const EventCategoryForm = ({
  type,
  data,
  formRedirect,
  categoryId,
  initialValues,
}: EventCategoryFormProps) => {
  const { languages } = initialValues || {}
  const { supportedLanguages } = data?.languages || {}
  const { organizationMemberships } = data?.currentUser || {}
  const initialSelectedLanguages = useMemo(
    () => (type === "update" ? languages || {} : supportedLanguages),
    [type, languages, supportedLanguages]
  )

  // Translations, router, urql
  const { t } = useTranslation("events")
  const router = useRouter()

  // Handling form values, errors and submission
  const [form] = Form.useForm()
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<Error | CombinedError | null>(null)
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    initialSelectedLanguages || []
  )

  // Mutations
  const mutation =
    type === "update"
      ? UpdateEventCategoryDocument
      : CreateEventCategoryDocument
  const [, formMutation] = useMutation(mutation)

  useEffect(() => {
    // Set form initialValues if they have changed after the initial rendering
    form.setFieldsValue(initialValues)

    // setSelectedLanguages if languages from initialValues change
    if (initialSelectedLanguages) {
      setSelectedLanguages(initialSelectedLanguages)
      form.setFieldsValue({ languages: initialSelectedLanguages })
    }
  }, [form, initialValues, initialSelectedLanguages])

  const handleSubmit = useCallback(
    async (values) => {
      setFormSubmitting(true)
      setFormError(null)
      try {
        const input =
          type === "create"
            ? {
                eventCategory: {
                  ...filterObjectByKeys(values, [
                    "ownerOrganizationId",
                    "name",
                    "description",
                    "color",
                  ]),
                },
              }
            : {
                patch: {
                  ...filterObjectByKeys(values, [
                    "ownerOrganizationId",
                    "name",
                    "description",
                    "color",
                  ]),
                },
                id: categoryId,
              }
        const { error } = await formMutation({ input })
        if (error) throw error
        setFormError(null)
        router.push(formRedirect, formRedirect)
      } catch (e) {
        setFormError(e)
      }
      setFormSubmitting(false)
    },
    [formMutation, categoryId, formRedirect, router, type]
  )

  return (
    <Form
      {...formItemLayout}
      form={form}
      initialValues={{ languages: selectedLanguages, ...initialValues }}
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
          data-cy="eventcategoryform-select-language"
          mode="multiple"
          placeholder={t("forms.placeholders.languages")}
          allowClear
          onChange={(e) => setSelectedLanguages(e as string[])}
        >
          {supportedLanguages?.map((l, i) => (
            <Option
              key={i}
              data-cy={`eventcategoryform-select-language-option-${l}`}
              value={l ? l : ""}
            >
              {t(`common:${l}`)}
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item
        label={t("organizer")}
        name="ownerOrganizationId"
        rules={[
          {
            required: true,
            message: t("forms.rules.eventCategory.provideOrganizer"),
          },
        ]}
      >
        <Select
          data-cy="eventcategoryform-select-organization-id"
          placeholder={t("forms.placeholders.eventCategory.organizer")}
        >
          {organizationMemberships?.nodes?.map((o, i) => (
            <Option
              key={o.organization?.id}
              data-cy={`eventcategoryform-select-organization-id-option-${i}`}
              value={o.organization?.id!}
            >
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
                name={["name", l!]}
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.eventCategory.provideName"),
                  },
                ]}
                noStyle
              >
                <Input
                  data-cy={`eventcategoryform-input-name-${l}`}
                  placeholder={t(`common:lang.in.${l}`)}
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
                name={["description", l!]}
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.eventCategory.provideDescription"),
                  },
                ]}
                noStyle
              >
                <Input.TextArea
                  data-cy={`eventcategoryform-input-description-${l}`}
                  placeholder={t(`common:lang.in.${l}`)}
                  style={i > 0 ? { marginTop: 5 } : undefined}
                />
              </Form.Item>
            ))
          )}
        </Input.Group>
      </Form.Item>
      <Form.Item label={t("common:color")} name="color">
        <ColorPicker data-cy="eventcategoryform-color" />
      </Form.Item>
      {formError && (
        <Form.Item {...tailFormItemLayout}>
          <ErrorAlert
            error={formError}
            message={t("errors.eventCategoryCreationFailed")}
          />
        </Form.Item>
      )}
      <Form.Item {...tailFormItemLayout}>
        <Button
          data-cy="eventcategoryform-button-submit"
          disabled={selectedLanguages.length === 0 ? true : false}
          htmlType="submit"
          loading={formSubmitting}
          type="primary"
        >
          {t(`common:${type}`)}
        </Button>
      </Form.Item>
    </Form>
  )
}
