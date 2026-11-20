/**
 * The registry of runtime feature flags.
 *
 * Every key here has a row in `app_public.feature_flags`, inserted by the
 * migration that introduces the feature, and a database test fails when the
 * two disagree. The database is authoritative: `app_public.feature_enabled()`
 * decides whether a feature is on, and the code on every tier asks it through
 * `useFeature` / `<Feature>` (client), `isFeatureEnabled` (server) and
 * `withFeature` (worker). A key that is missing from the table reads as off.
 *
 * Adding a feature is one entry:
 *
 *   my_feature: {
 *     description: "What the flag gates",
 *     // Only for features that need server configuration. The server marks
 *     // the flag unavailable at boot unless every variable is non-empty.
 *     requiresEnv: ["MY_SERVICE_SECRET"],
 *   },
 *
 * Removing a flag starts by deleting its entry: `FeatureKey` then no longer
 * accepts the key, so the compiler lists every gate that still names it.
 */

export interface FeatureDefinition {
  /** What the flag gates. Shown to developers next to the switch. */
  readonly description: string
  /**
   * Environment variables the server needs for this feature. When any of them
   * is missing or empty the server records the flag as unavailable, and the
   * feature reads as off whatever its state.
   */
  readonly requiresEnv?: readonly string[]
}

export const FEATURES = {
  ribbon_text: {
    description: "Custom ribbon text for highlighted events.",
  },
  calendar_invites: {
    description:
      "Calendar invitation in registration emails and calendar links after signing up.",
  },
  registration_reminders: {
    description:
      "Reminders before registration opens: the reminder button, reminder settings and reminder emails.",
  },
  telegram_reminders: {
    description:
      "Registration reminders through the Telegram bot, and linking a Telegram account.",
    requiresEnv: ["TELEGRAM_BOT_TOKEN"],
  },
  mcp_server: {
    description:
      "MCP server at /mcp for AI assistants: browse events, register, and let admins create draft events.",
    requiresEnv: ["KEYCLOAK_ISSUER"],
  },
  payments: {
    description:
      "Stripe payments for paid quotas: prices, the pay page, Checkout, organizer payment tools and payment emails.",
    requiresEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  },
} as const satisfies Record<string, FeatureDefinition>

export type FeatureKey = keyof typeof FEATURES

/** The states of `app_public.feature_state`, as stored in the database. */
export type FeatureFlagState = "off" | "admins_only" | "on"

export const FEATURE_FLAG_STATES: readonly FeatureFlagState[] = [
  "off",
  "admins_only",
  "on",
]

/** Every key in the registry. */
export const featureKeys = (): FeatureKey[] =>
  Object.keys(FEATURES) as FeatureKey[]

/**
 * Whether the environment holds every variable a feature requires. Features
 * without requirements are always configured.
 */
export const featureConfigured = (
  definition: FeatureDefinition,
  env: Record<string, string | undefined>
): boolean => (definition.requiresEnv ?? []).every((name) => Boolean(env[name]))
