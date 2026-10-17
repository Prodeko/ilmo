import { memo, useEffect, useState } from "react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import {
  DragOutlined,
  MinusCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons"
import { arePropsEqual } from "@app/lib"
import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  theme,
  Tooltip,
  Typography,
} from "antd"

import { useTranslation } from "../."
import { Draggable } from "../Draggable"

import {
  buildPresetQuota,
  buildTemplateQuotas,
  quotaPresets,
  quotaTemplates,
} from "./eventTemplates"
import { RequiredMark } from "./RequiredMark"
import { TemplateSelector } from "./TemplateSelector"

type QuotaData = {
  // Set on quotas created from a preset checkbox or a quota template
  presetKey?: string
  templateKey?: string
}

interface QuotasTabProps {
  initialValues?: any
  selectedLanguages: string[]
}

export const QuotasTab: React.FC<QuotasTabProps> = memo(
  ({ initialValues, selectedLanguages }) => {
    const [hasOpenQuota, setHasOpenQuota] = useState(false)
    const { t, lang } = useTranslation("events")
    const { token } = theme.useToken()
    const form = Form.useFormInstance()
    const quotas = (Form.useWatch("quotas", form) ?? []) as QuotaData[]

    function presetKeysOf(quotas: QuotaData[]) {
      const keys = quotas.map((q) => q?.presetKey).filter(Boolean)
      return [...new Set(keys)] as string[]
    }

    // Presets that were ticked by hand, so a template doesn't add them twice
    function buildTemplateWithoutTickedPresets(templateKey: string) {
      const current = (form.getFieldValue("quotas") ?? []) as QuotaData[]
      const ticked = presetKeysOf(current.filter((q) => !q?.templateKey))
      return buildTemplateQuotas(templateKey, selectedLanguages).filter(
        (q) => !ticked.includes(q.presetKey)
      )
    }

    function handlePresetsChange(checked: string[]) {
      const current = (form.getFieldValue("quotas") ?? []) as QuotaData[]
      const present = presetKeysOf(current)
      const kept = current.filter(
        (q) => !q?.presetKey || checked.includes(q.presetKey)
      )
      const added = checked
        .filter((key) => !present.includes(key))
        .map((key) => buildPresetQuota(key, selectedLanguages))
      form.setFieldValue("quotas", [...kept, ...added])
    }

    useEffect(() => {
      if (initialValues?.openQuotaSize > 0) setHasOpenQuota(true)
    }, [initialValues])

    return (
      <DndProvider backend={HTML5Backend}>
        <TemplateSelector
          build={buildTemplateWithoutTickedPresets}
          listName="quotas"
          notes={{
            yearGroups: (
              <>
                <RequiredMark />
                {t("templates.quotas.yearGroupsNote")}
              </>
            ),
          }}
          templateKeys={quotaTemplates.map((template) => template.key)}
        />
        <Form.Item
          label={t("templates.quotas.presets")}
          labelCol={{ flex: "none" }}
          wrapperCol={{ flex: "auto" }}
        >
          <Checkbox.Group
            data-cy="eventform-quotas-presets"
            options={Object.entries(quotaPresets).map(([key, preset]) => ({
              value: key,
              label: preset.title[lang as "fi" | "en"] ?? preset.title.en,
            }))}
            value={presetKeysOf(quotas)}
            onChange={(checked) => handlePresetsChange(checked as string[])}
          />
        </Form.Item>
        <Form.List
          name="quotas"
          rules={[
            {
              validator: async (_, quotas) => {
                // An open quota alone is not enough, the database requires
                // at least one regular quota
                if (!quotas || quotas.length < 1) {
                  return Promise.reject(
                    new Error(t("errors.mustProvideEventQuota"))
                  )
                }
              },
            },
          ]}
        >
          {(fields, { add, remove, move }) => (
            <>
              {fields.map((field, index) => {
                const { key, name } = field
                const { registrations } = initialValues?.quotas?.[key] || {}
                const numRegistrations = registrations?.totalCount || 0
                return (
                  <Draggable
                    {...field}
                    key={key}
                    id={key}
                    index={index}
                    move={move}
                  >
                    {/* These hidden form fields are needed so that the update
                      variant of the EventForm works correctly */}
                    <Form.Item name={[name, "id"]} required={false} noStyle>
                      <Input type="hidden" />
                    </Form.Item>
                    <Form.Item name={[name, "position"]} noStyle required>
                      <Input type="hidden" />
                    </Form.Item>
                    <Space
                      align="baseline"
                      style={{ display: "flex", marginBottom: 8 }}
                    >
                      <DragOutlined />
                      {selectedLanguages.map((l) => (
                        <Form.Item
                          key={`${name}-${l}`}
                          name={[name, "title", l.toLowerCase()]}
                          rules={[
                            {
                              required: true,
                              message: t("forms.rules.quota.provideQuotaTitle"),
                            },
                          ]}
                          noStyle
                        >
                          <Input
                            data-cy={`eventform-input-quotas-title-${l}-${index}`}
                            placeholder={`${t(
                              "forms.placeholders.quota.title"
                            )} ${t(`common:lang.in.${l}`)}`}
                          />
                        </Form.Item>
                      ))}
                      <Form.Item
                        name={[name, "size"]}
                        rules={[
                          {
                            required: true,
                            message: t("forms.rules.quota.provideQuotaSize"),
                          },
                        ]}
                        noStyle
                      >
                        <InputNumber
                          data-cy={`eventform-input-quotas-size-${index}`}
                          min={1}
                          placeholder={t("forms.placeholders.quota.size")}
                        />
                      </Form.Item>
                      {numRegistrations === 0 ? (
                        <Tooltip title={t("removeQuota")}>
                          <MinusCircleOutlined
                            data-cy="eventform-quotas-remove-quota"
                            style={{ color: token.colorError }}
                            onClick={() => remove(name)}
                          />
                        </Tooltip>
                      ) : (
                        <div>
                          {t("numRegistrations")}: {numRegistrations}
                        </div>
                      )}
                    </Space>
                  </Draggable>
                )
              })}
              <Form.Item>
                <Button
                  data-cy="eventform-quotas-add-quota"
                  icon={<PlusOutlined />}
                  type="dashed"
                  block
                  onClick={() => add()}
                >
                  {t("addQuota")}
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>
        <Space>
          <span>{t("addOpenQuota")}: </span>
          <Switch
            checked={hasOpenQuota}
            data-cy="eventform-quotas-switch-is-open-quota"
            onChange={(val) => setHasOpenQuota(val)}
          />
          <Form.Item
            name="openQuotaSize"
            rules={[
              {
                required: hasOpenQuota,
                message: t("forms.rules.quota.provideQuotaSize"),
              },
            ]}
            noStyle
          >
            <InputNumber
              data-cy="eventform-input-quotas-openquota-size"
              disabled={!hasOpenQuota}
              min={0}
              placeholder={t("forms.placeholders.quota.size")}
            />
          </Form.Item>
        </Space>
        <Typography.Paragraph style={{ marginTop: 8 }} type="secondary">
          {t("overflowQuotaInfo")}
        </Typography.Paragraph>
      </DndProvider>
    )
  },
  arePropsEqual
)
