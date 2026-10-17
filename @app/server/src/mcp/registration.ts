import { McpEventQuery, QuestionType } from "@app/graphql"

type McpEvent = NonNullable<McpEventQuery["eventBySlug"]>

export type AnswerValue = string | string[]

export interface RegistrationInput {
  quotaId: string
  firstName: string
  lastName: string
  email: string
  answers: Record<string, AnswerValue>
}

function optionLabels(data: McpEvent["eventQuestions"]["nodes"][0]["data"]) {
  const labels = new Set<string>()
  for (const option of data ?? []) {
    if (option?.fi) labels.add(option.fi)
    if (option?.en) labels.add(option.en)
  }
  return labels
}

/**
 * Mirrors the database checks so that a doomed request is answered before
 * claimRegistrationToken spends one of the requester's rate-limited attempts.
 * It is stricter than the database in one respect: radio and checkbox answers
 * must be one of the question's options, as they always are on the web form.
 */
export function validateRegistration(
  event: McpEvent,
  input: RegistrationInput
): string[] {
  const errors: string[] = []

  if (!event.signupOpen) {
    errors.push("Registration for this event is not open.")
  }
  if (!event.quotas.nodes.some((q) => q.id === input.quotaId)) {
    errors.push("quotaId is not one of this event's quotas.")
  }
  for (const [field, value] of [
    ["firstName", input.firstName],
    ["lastName", input.lastName],
  ] as const) {
    if (!value) errors.push(`${field} is required.`)
    else if (/\s/.test(value)) errors.push(`${field} must not contain spaces.`)
  }

  const questions = new Map(event.eventQuestions.nodes.map((q) => [q.id, q]))
  for (const questionId of Object.keys(input.answers)) {
    if (!questions.has(questionId)) {
      errors.push(
        `Answer ${questionId} does not match a question of this event.`
      )
    }
  }

  for (const question of event.eventQuestions.nodes) {
    const label = question.label.en || question.label.fi
    const answer = input.answers[question.id]
    if (answer === undefined) {
      if (question.isRequired) errors.push(`"${label}" is required.`)
      continue
    }
    const options = optionLabels(question.data)
    switch (question.type) {
      case QuestionType.Text:
        if (typeof answer !== "string") {
          errors.push(`"${label}" expects a string.`)
        } else if (question.isRequired && !answer.trim()) {
          errors.push(`"${label}" is required.`)
        }
        break
      case QuestionType.Radio:
        if (typeof answer !== "string" || !options.has(answer)) {
          errors.push(
            `"${label}" expects exactly one of: ${[...options].join(", ")}.`
          )
        }
        break
      case QuestionType.Checkbox:
        if (
          !Array.isArray(answer) ||
          answer.some((a) => typeof a !== "string" || !options.has(a))
        ) {
          errors.push(
            `"${label}" expects a list of options from: ${[...options].join(", ")}.`
          )
        } else if (question.isRequired && answer.length === 0) {
          errors.push(`"${label}" requires at least one option.`)
        }
        break
    }
  }

  return errors
}

interface RichTextNode {
  text?: string
  children?: RichTextNode[]
}

function nodeText(node: RichTextNode): string {
  if (typeof node.text === "string") return node.text
  return (node.children ?? []).map(nodeText).join("")
}

/** Flattens the editor's Slate document into paragraphs of plain text. */
export function richTextToPlain(nodes: unknown): string {
  if (!Array.isArray(nodes)) return ""
  return nodes
    .map((n) => nodeText(n as RichTextNode))
    .filter(Boolean)
    .join("\n\n")
}
