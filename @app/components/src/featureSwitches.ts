/*
 * FEATURE SWITCHES (client): stand-ins for `useFeature(key)` until the client
 * reads the feature flags. Replace each constant with `useFeature("<key>")`
 * (or `<Feature name="<key>">`) at its call sites and delete this file. The
 * database, server and worker gates do not read these constants; they follow
 * app_public.feature_flags. Off by default, as the flags are.
 */

/** calendar_invites: calendar links on the event page after signing up. */
export const CALENDAR_INVITES_ENABLED: boolean = false

/** registration_reminders: reminder button, settings page and menu links. */
export const REGISTRATION_REMINDERS_ENABLED: boolean = false

/** telegram_reminders: Telegram options in the reminder settings. */
export const TELEGRAM_REMINDERS_ENABLED: boolean = false
