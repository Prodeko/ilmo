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
}

/** A question of the event the registration form is shown for. */
export interface RegistrationPrefillQuestion {
  id: string
}

export interface RegistrationPrefillInput {
  /** The signed-in user, or null/undefined when signed out or loading. */
  currentUser?: RegistrationPrefillUser | null
  /**
   * The questions of the event. Not used for the initial values yet; taken
   * here so that answer defaults are derived in this function too.
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
 * The initial values of the registration form for a new registration.
 *
 * Without the `keycloak_names` feature the first and last name are inferred
 * from the user's display name by splitting it on single spaces. With it,
 * the Keycloak first and last name are preferred, and the display name is
 * used only when it splits unambiguously. The email is the primary email.
 *
 * Pure: the register page memoises the result, so the form is only reset
 * when the inputs change.
 */
export const buildRegistrationInitialValues = ({
  currentUser,
  features,
}: RegistrationPrefillInput): RegistrationInitialValues => {
  const user = currentUser || {}
  const [firstName, lastName] = features?.keycloak_names
    ? keycloakOrUnambiguousName(user)
    : splitDisplayName(user.name)

  return {
    firstName,
    lastName,
    email: user.primaryEmail,
  }
}
