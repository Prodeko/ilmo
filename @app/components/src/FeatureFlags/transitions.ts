import { FeatureState } from "@app/graphql"
import { featureAdminPreview } from "@app/lib"

import type {
  AdminFeatures_FeatureFlagEventFragment,
  AdminFeatures_FeatureFlagFragment,
} from "@app/graphql"

/**
 * Rules of the Features page that do not depend on rendering.
 */

export const FEATURE_STATES = [
  FeatureState.Off,
  FeatureState.AdminsOnly,
  FeatureState.On,
] as const

/** The state as stored in the database and used in translation keys. */
export const stateKey = (state: FeatureState) =>
  ({
    [FeatureState.Off]: "off",
    [FeatureState.AdminsOnly]: "admins_only",
    [FeatureState.On]: "on",
  })[state] as "off" | "admins_only" | "on"

/**
 * What switching a flag from one state to another needs:
 * - `none`: nothing changes.
 * - `immediate`: Off <-> Admins only only affects admins; save at once.
 * - `confirmOn`: everyone starts seeing the feature.
 * - `confirmLeaveOn`: everyone but admins (or everyone) stops seeing it.
 */
export type Transition = "none" | "immediate" | "confirmOn" | "confirmLeaveOn"

export const transition = (from: FeatureState, to: FeatureState): Transition =>
  from === to
    ? "none"
    : to === FeatureState.On
      ? "confirmOn"
      : from === FeatureState.On
        ? "confirmLeaveOn"
        : "immediate"

export type FeatureFlagEvent = AdminFeatures_FeatureFlagEventFragment

/** The events of one flag, newest first (the order the API returns). */
export const eventsOf = (
  events: readonly (FeatureFlagEvent | null)[],
  key: string
): FeatureFlagEvent[] =>
  events.filter((event): event is FeatureFlagEvent => event?.key === key)

export interface PreviewInfo {
  /** Whether Admins only lets admins preview the feature at all. */
  previewable: boolean
  /** Whether admins have previewed the feature before it goes on. */
  previewed: boolean
  /** The most recent switch into admins_only, if the audit log has one. */
  lastPreviewStart: FeatureFlagEvent | null
}

/**
 * Whether the flag has been in admins_only, according to the audit log, or is
 * in it now.
 */
export const previewInfo = (
  flag: Pick<AdminFeatures_FeatureFlagFragment, "key" | "state">,
  flagEvents: readonly FeatureFlagEvent[]
): PreviewInfo => {
  const lastPreviewStart =
    flagEvents.find((event) => event.newState === FeatureState.AdminsOnly) ??
    null
  return {
    previewable: featureAdminPreview(flag.key),
    previewed:
      lastPreviewStart !== null || flag.state === FeatureState.AdminsOnly,
    lastPreviewStart,
  }
}

/**
 * Whether a state can be chosen for a flag. Off is always reachable; Admins
 * only is not offered for a feature admins cannot preview.
 */
export const stateSelectable = (
  flag: Pick<
    AdminFeatures_FeatureFlagFragment,
    "key" | "available" | "retiredAt"
  >,
  state: FeatureState
): boolean => {
  if (flag.retiredAt) {
    return false
  }
  if (state === FeatureState.AdminsOnly && !featureAdminPreview(flag.key)) {
    return false
  }
  return flag.available || state === FeatureState.Off
}
