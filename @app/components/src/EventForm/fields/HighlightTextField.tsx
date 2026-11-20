import { Form, Input } from "antd"

import { useTranslation } from "../.."

const { Group } = Input

interface HighlightTextFieldProps {
  selectedLanguages: string[]
}

/**
 * The ribbon text of a highlighted event, one input per selected language.
 * Shown while the event is highlighted.
 */
export const HighlightTextField: React.FC<HighlightTextFieldProps> = ({
  selectedLanguages,
}) => {
  const { t } = useTranslation("events")
  const isHighlighted = Form.useWatch("isHighlighted")

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
