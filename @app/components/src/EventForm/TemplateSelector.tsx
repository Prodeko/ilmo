import { useState } from "react"
import { Form, Modal, Radio, Typography } from "antd"

import { useTranslation } from "../."

import { NO_TEMPLATE } from "./eventTemplates"

type TemplateItem = { templateKey?: string }

interface TemplateSelectorProps {
  // The EventForm list the template fills in
  listName: "questions" | "quotas"
  templateKeys: string[]
  // Returns the list items created by the given template
  build: (templateKey: string) => TemplateItem[]
  // Called after the list has been changed
  onApplied?: () => void
  // Shown under the selector while the template with that key is selected
  notes?: Partial<Record<string, React.ReactNode>>
}

/**
 * Lets the user pick a ready-made template that adds items to a list in the
 * EventForm. Switching to another template (or to none) replaces the items
 * the previous template created, after a confirmation. Items the user added
 * themselves are kept.
 */
export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  listName,
  templateKeys,
  build,
  onApplied,
  notes,
}) => {
  const { t } = useTranslation("events")
  const form = Form.useFormInstance()
  const [modal, modalContextHolder] = Modal.useModal()
  const [selectedTemplate, setSelectedTemplate] = useState(NO_TEMPLATE)

  function currentItems() {
    return (form.getFieldValue(listName) as TemplateItem[]) ?? []
  }

  function applyTemplate(templateKey: string) {
    const kept = currentItems().filter((item) => !item?.templateKey)
    form.setFieldValue(listName, [...kept, ...build(templateKey)])
    setSelectedTemplate(templateKey)
    onApplied?.()
  }

  function handleTemplateChange(templateKey: string) {
    if (!currentItems().some((item) => item?.templateKey)) {
      applyTemplate(templateKey)
      return
    }
    modal.confirm({
      title: t(`templates.${listName}.confirmRemove`),
      okText: t("common:yes"),
      cancelText: t("common:no"),
      onOk: () => applyTemplate(templateKey),
    })
  }

  return (
    <>
      {modalContextHolder}
      <Form.Item
        label={t(`templates.${listName}.label`)}
        // Override the form-wide centered layout so this row starts from
        // the left edge of the tab
        labelCol={{ flex: "none" }}
        wrapperCol={{ flex: "auto" }}
      >
        <Radio.Group
          data-cy={`eventform-${listName}-template`}
          optionType="button"
          value={selectedTemplate}
          onChange={(e) => handleTemplateChange(e.target.value)}
        >
          {[NO_TEMPLATE, ...templateKeys].map((key) => (
            <Radio.Button
              key={key}
              data-cy={`eventform-${listName}-template-${key}`}
              value={key}
            >
              {t(`templates.${listName}.${key}`)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>
      {notes?.[selectedTemplate] && (
        <Typography.Paragraph>{notes[selectedTemplate]}</Typography.Paragraph>
      )}
    </>
  )
}
