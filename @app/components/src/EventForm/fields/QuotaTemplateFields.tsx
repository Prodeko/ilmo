import { Checkbox, Form } from "antd"

import { useTranslation } from "../.."
import {
  buildPresetQuota,
  buildTemplateQuotas,
  presetKeysOf,
  quotaPresets,
  quotaTemplates,
  TemplateItem,
  togglePresets,
  withoutHandPickedPresets,
} from "../eventTemplates"
import { RequiredMark } from "../RequiredMark"

import { TemplateSelector } from "./TemplateSelector"

interface QuotaTemplateFieldsProps {
  selectedLanguages: string[]
}

// The quota template selector and the ready-made quota checkboxes
export const QuotaTemplateFields: React.FC<QuotaTemplateFieldsProps> = ({
  selectedLanguages,
}) => {
  const { t, lang } = useTranslation("events")
  const form = Form.useFormInstance()
  const quotas = (Form.useWatch("quotas", form) ?? []) as TemplateItem[]

  function currentQuotas() {
    return (form.getFieldValue("quotas") ?? []) as TemplateItem[]
  }

  return (
    <>
      <TemplateSelector
        build={(templateKey) =>
          withoutHandPickedPresets(
            currentQuotas(),
            buildTemplateQuotas(templateKey, selectedLanguages)
          )
        }
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
          onChange={(checked) =>
            form.setFieldValue(
              "quotas",
              togglePresets(currentQuotas(), checked as string[], (key) => [
                buildPresetQuota(key, selectedLanguages),
              ])
            )
          }
        />
      </Form.Item>
    </>
  )
}
