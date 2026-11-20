import { Form, Input } from "antd"

import { useFeature, useTranslation } from "../.."

const { Group } = Input

// Holds a form value without showing it
const KeepValue: React.FC<{ value?: unknown }> = () => null

interface HighlightTextFieldProps {
  selectedLanguages: string[]
}

/**
 * The ribbon text of a highlighted event, one input per selected language.
 * Shown while the event is highlighted. When the feature is off, the inputs
 * are hidden but the stored text stays in the submitted values, so saving the
 * event keeps it.
 */
export const HighlightTextField: React.FC<HighlightTextFieldProps> = ({
  selectedLanguages,
}) => {
  const { t } = useTranslation("events")
  const customRibbonText = useFeature("ribbon_text")
  const isHighlighted = Form.useWatch("isHighlighted")

  if (!customRibbonText) {
    return (
      <Form.Item name="highlightText" hidden noStyle>
        <KeepValue />
      </Form.Item>
    )
  }

  if (!isHighlighted) {
    return null
  }

  return (
    <Form.Item
      extra={t("forms.highlightTextHelp")}
      label={t("forms.highlightText")}
    >
      <Group compact>
        {selectedLanguages.map((l, i) => (
          <Form.Item key={l} name={["highlightText", l.toLowerCase()]} noStyle>
            <Input
              data-cy={`eventform-input-highlight-text-${l}`}
              maxLength={40}
              placeholder={t(`common:lang.in.${l}`)}
              style={i > 0 ? { marginTop: 5 } : undefined}
            />
          </Form.Item>
        ))}
      </Group>
    </Form.Item>
  )
}
