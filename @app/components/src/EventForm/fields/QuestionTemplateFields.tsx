import { Checkbox, Form } from "antd"

import { useTranslation } from "../.."
import {
  buildPresetQuestions,
  buildTemplateQuestions,
  presetKeysOf,
  questionPresets,
  questionTemplates,
  TemplateItem,
  togglePresets,
  withoutHandPickedPresets,
} from "../eventTemplates"

import { TemplateSelector } from "./TemplateSelector"

interface QuestionTemplateFieldsProps {
  selectedLanguages: string[]
  // The questions tab reads the list without watching it, so it is told
  // when the list has changed
  onChange: () => void
}

// The event template selector and the ready-made question checkboxes
export const QuestionTemplateFields: React.FC<QuestionTemplateFieldsProps> = ({
  selectedLanguages,
  onChange,
}) => {
  const { t, lang } = useTranslation("events")
  const form = Form.useFormInstance()
  const questions = (Form.useWatch("questions", form) ?? []) as TemplateItem[]

  function currentQuestions() {
    return (form.getFieldValue("questions") ?? []) as TemplateItem[]
  }

  return (
    <>
      <TemplateSelector
        build={(templateKey) =>
          withoutHandPickedPresets(
            currentQuestions(),
            buildTemplateQuestions(templateKey, selectedLanguages)
          )
        }
        listName="questions"
        templateKeys={questionTemplates.map((template) => template.key)}
        onApplied={onChange}
      />
      <Form.Item
        label={t("templates.questions.presets")}
        labelCol={{ flex: "none" }}
        wrapperCol={{ flex: "auto" }}
      >
        <Checkbox.Group
          data-cy="eventform-questions-presets"
          options={Object.entries(questionPresets).map(([key, preset]) => ({
            value: key,
            label: preset[0].label[lang as "fi" | "en"] ?? preset[0].label.en,
          }))}
          value={presetKeysOf(questions)}
          onChange={(checked) => {
            form.setFieldValue(
              "questions",
              togglePresets(currentQuestions(), checked as string[], (key) =>
                buildPresetQuestions(key, selectedLanguages)
              )
            )
            onChange()
          }}
        />
      </Form.Item>
    </>
  )
}
