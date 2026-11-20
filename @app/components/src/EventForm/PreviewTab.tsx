import { EventPage_QuestionFragment } from "@app/graphql"
import { FormInstance, Typography } from "antd"

import { EventRegistrationForm, useTranslation } from "../."

type LocalizedText = Record<string, string | undefined> | null | undefined

interface PreviewTabProps {
  form: FormInstance
  selectedLanguages: string[]
}

/**
 * Shows the registration form as registrants will see it, built from the
 * questions currently in the event form. Nothing is submitted.
 */
export const PreviewTab: React.FC<PreviewTabProps> = ({
  form,
  selectedLanguages,
}) => {
  const { t, lang } = useTranslation("events")

  // The registration form shows texts in the page language. Fall back to the
  // event's other languages so an untranslated text isn't shown as empty.
  const localize = (text: LocalizedText) => ({
    [lang]:
      [lang, ...selectedLanguages].map((l) => text?.[l]).find(Boolean) ?? "",
  })

  const questions = ((form.getFieldValue("questions") ?? []) as any[])
    // Skip rows where no question type has been chosen yet
    .filter((q) => q?.type)
    .map((q, index) => ({
      // New questions don't have an id yet, but answers are keyed by it
      id: q.id ?? `preview-${index}`,
      type: q.type.toUpperCase(),
      isRequired: !!q.isRequired,
      label: localize(q.label),
      data: q.data?.map(localize) ?? null,
    })) as EventPage_QuestionFragment[]

  return (
    <>
      <Typography.Paragraph>{t("previewInfo")}</Typography.Paragraph>
      <EventRegistrationForm questions={questions} type="create" preview />
    </>
  )
}
