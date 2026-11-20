import type { FeatureKey } from "./featureFlags"

/**
 * The parts of the signed-in user that the registration form is prefilled
 * from. Structural, so that any query selecting these fields can pass its
 * `currentUser` as is.
 */
export interface RegistrationPrefillUser {
  name?: string | null
  primaryEmail?: string | null
  /** First name(s) from Keycloak; null for accounts that never used it. */
  firstName?: string | null
  /** Last name from Keycloak; null for accounts that never used it. */
  lastName?: string | null
  /** The answer defaults the user has saved; only readable by the user. */
  registrationProfile?: RegistrationProfileValues | null
}

/** The fields of `app_public.registration_profiles` that prefill answers. */
export interface RegistrationProfileValues {
  telegram?: string | null
  dietaryRestrictions?: string | null
}

/**
 * The values of `app_public.question_prefill`: which registration profile
 * field an event question asks for.
 */
export type QuestionPrefillField = "TELEGRAM" | "DIETARY_RESTRICTIONS"

/** The registration profile field each prefill question reads and writes. */
export const QUESTION_PREFILL_PROFILE_FIELDS: Readonly<
  Record<QuestionPrefillField, keyof RegistrationProfileValues>
> = {
  TELEGRAM: "telegram",
  DIETARY_RESTRICTIONS: "dietaryRestrictions",
}

/** A question of the event the registration form is shown for. */
export interface RegistrationPrefillQuestion {
  id: string
  /** Set on TEXT questions whose answer comes from the registration profile. */
  prefill?: string | null
}

const profileFieldOf = (
  question: RegistrationPrefillQuestion
): keyof RegistrationProfileValues | undefined =>
  question.prefill
    ? QUESTION_PREFILL_PROFILE_FIELDS[question.prefill as QuestionPrefillField]
    : undefined

export interface RegistrationPrefillInput {
  /** The signed-in user, or null/undefined when signed out or loading. */
  currentUser?: RegistrationPrefillUser | null
  /**
   * The questions of the event. Questions marked for prefill get their
   * answer from the user's registration profile.
   */
  questions?: readonly RegistrationPrefillQuestion[] | null
  /**
   * The feature flags that change the prefill, as read by the caller (for
   * example with `useFeature`). A missing key reads as off.
   */
  features?: Partial<Record<FeatureKey, boolean>>
}

export interface RegistrationInitialValues {
  firstName: string | undefined
  lastName: string | undefined
  email: string | null | undefined
  /**
   * Answers by question id. Present only when at least one answer is
   * prefilled.
   */
  answers?: Record<string, string>
}

type NamePair = [string | undefined, string | undefined]

/**
 * Splits the display name on single spaces: the first part is the first name
 * and the second part the last name. Any further parts are dropped.
 */
const splitDisplayName = (name: string | null | undefined): NamePair => {
  const [firstName, lastName] = name ? name.split(" ") : []
  return [firstName, lastName]
}

/**
 * The first and last name from Keycloak when both are known. Otherwise the
 * display name, trimmed and split on whitespace, but only when it has at most
 * two words: with three or more ("Anna Maria von Wright") there is no telling
 * where the first name ends, so the names are left for the user to fill in.
 */
const keycloakOrUnambiguousName = (user: RegistrationPrefillUser): NamePair => {
  if (user.firstName && user.lastName) {
    return [user.firstName, user.lastName]
  }
  const trimmed = user.name?.trim()
  const parts = trimmed ? trimmed.split(/\s+/) : []
  if (parts.length > 2) {
    return [undefined, undefined]
  }
  return [parts[0], parts[1]]
}

/**
 * Answers to the questions marked for prefill, from the registration profile.
 * Questions without a saved value are left out.
 */
const prefilledAnswers = (
  questions: readonly RegistrationPrefillQuestion[] | null | undefined,
  profile: RegistrationProfileValues | null | undefined
): Record<string, string> => {
  const answers: Record<string, string> = {}
  for (const question of questions ?? []) {
    const field = profileFieldOf(question)
    const value = field ? profile?.[field] : undefined
    if (value) {
      answers[question.id] = value
    }
  }
  return answers
}

/**
 * The initial values of the registration form for a new registration.
 *
 * Without the `keycloak_names` feature the first and last name are inferred
 * from the user's display name by splitting it on single spaces. With it,
 * the Keycloak first and last name are preferred, and the display name is
 * used only when it splits unambiguously. The email is the primary email.
 * Answers to questions marked for prefill come from the user's registration
 * profile.
 *
 * Pure: the register page memoises the result, so the form is only reset
 * when the inputs change.
 */
export const buildRegistrationInitialValues = ({
  currentUser,
  questions,
  features,
}: RegistrationPrefillInput): RegistrationInitialValues => {
  const user = currentUser || {}
  const [firstName, lastName] = features?.keycloak_names
    ? keycloakOrUnambiguousName(user)
    : splitDisplayName(user.name)
  const answers = prefilledAnswers(questions, user.registrationProfile)

  return {
    firstName,
    lastName,
    email: user.primaryEmail,
    ...(Object.keys(answers).length > 0 ? { answers } : {}),
  }
}
