/**
 * The parts of the signed-in user that the registration form is prefilled
 * from. Structural, so that any query selecting these fields can pass its
 * `currentUser` as is.
 */
export interface RegistrationPrefillUser {
  name?: string | null
  primaryEmail?: string | null
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
}

export interface RegistrationInitialValues {
  firstName: string | undefined
  lastName: string | undefined
  email: string | null | undefined
}

/**
 * The initial values of the registration form for a new registration.
 *
 * The first and last name are inferred from the user's display name by
 * splitting it on single spaces: the first part is the first name and the
 * second part the last name. Any further parts are dropped.
 *
 * Pure: the register page memoises the result, so the form is only reset
 * when the inputs change.
 */
export const buildRegistrationInitialValues = ({
  currentUser,
}: RegistrationPrefillInput): RegistrationInitialValues => {
  const { name, primaryEmail } = currentUser || {}
  const [firstName, lastName] = name ? name.split(" ") : []

  return {
    firstName,
    lastName,
    email: primaryEmail,
  }
}
