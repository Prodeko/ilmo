import { QuestionPrefill } from "@app/graphql"
import { Form, Select } from "antd"

import { useTranslation } from "../.."

// Holds a form value without showing it
const KeepValue: React.FC<{ value?: unknown }> = () => null

// The prefills an admin can choose. NONE is only sent to clear a prefill, see
// toEventInput.
type ProfilePrefill = Exclude<QuestionPrefill, QuestionPrefill.None>

// A prefill question is a TEXT question with a fixed label, filled in for
// every selected language when the admin picks what the answer prefills from
const PREFILL_LABELS: Record<ProfilePrefill, Record<string, string>> = {
  [QuestionPrefill.Telegram]: {
    fi: "Telegram-käyttäjänimi",
    en: "Telegram username",
  },
  [QuestionPrefill.DietaryRestrictions]: {
    fi: "Erityisruokavaliot ja allergiat",
    en: "Dietary restrictions and allergies",
  },
}

const AUTO_LABELS = Object.values(PREFILL_LABELS)
const PROFILE_PREFILLS = Object.keys(PREFILL_LABELS) as ProfilePrefill[]

/**
 * Labels for a question that now prefills from `prefill`. A label the admin
 * has written is kept; an empty label or one filled in for another prefill is
 * replaced.
 */
export function prefillQuestionLabel(
  prefill: ProfilePrefill,
  selectedLanguages: string[],
  currentLabel: Record<string, string> | null | undefined
): Record<string, string> {
  return Object.fromEntries(
    selectedLanguages.map((l) => {
      const lang = l.toLowerCase()
      const current = currentLabel?.[lang]
      const isAuto =
        !current || AUTO_LABELS.some((labels) => labels[lang] === current)
      const label = PREFILL_LABELS[prefill][lang] ?? PREFILL_LABELS[prefill].en
      return [lang, isAuto ? label : current]
    })
  )
}

interface QuestionPrefillFieldProps {
  /** The question's index in the `questions` form list. */
  name: number
}

/**
 * Keeps a question's `prefill` value in the submitted values without showing
 * it: for questions that cannot prefill, and while prefill_answers is off, so
 * saving the event keeps the stored marking.
 */
export const KeepQuestionPrefill: React.FC<QuestionPrefillFieldProps> = ({
  name,
}) => (
  <Form.Item name={[name, "prefill"]} hidden noStyle>
    <KeepValue />
  </Form.Item>
)

interface QuestionPrefillSelectProps extends QuestionPrefillFieldProps {
  selectedLanguages: string[]
  /** Called after the question's label has been filled in. */
  onChange?: () => void
}

/**
 * Which registration profile field prefills the answer to a TEXT question.
 * Placed inside `<Feature name="prefill_answers">`.
 */
export const QuestionPrefillSelect: React.FC<QuestionPrefillSelectProps> = ({
  name,
  selectedLanguages,
  onChange,
}) => {
  const { t } = useTranslation("events")
  const form = Form.useFormInstance()

  function handleChange(prefill: ProfilePrefill | undefined) {
    if (prefill) {
      const label = form.getFieldValue(["questions", name, "label"])
      form.setFieldValue(
        ["questions", name, "label"],
        prefillQuestionLabel(prefill, selectedLanguages, label)
      )
    }
    onChange?.()
  }

  return (
    <Form.Item
      // Cleared selects give undefined; store no prefill as null
      getValueFromEvent={(value) => value ?? null}
      name={[name, "prefill"]}
      noStyle
    >
      <Select
        data-cy={`eventform-select-questions-${name}-prefill`}
        options={PROFILE_PREFILLS.map((prefill) => ({
          value: prefill,
          label: t(`prefill.${prefill}`),
        }))}
        placeholder={t("prefill.placeholder")}
        popupMatchSelectWidth={false}
        style={{ width: "100%" }}
        allowClear
        onChange={handleChange}
      />
    </Form.Item>
  )
}
