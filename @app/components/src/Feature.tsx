import { createContext, ReactNode, useContext, useMemo } from "react"

import { PreviewTag } from "./PreviewTag"

import type { SharedLayout_QueryFragment } from "@app/graphql"
import type { FeatureKey } from "@app/lib"

/**
 * Client-side reads of the feature flags.
 *
 * The flags come with the shared layout query (`enabledFeaturesList`,
 * `adminPreviewFeaturesList`), which the database answers through
 * `app_public.feature_enabled()`, so the client never decides on its own
 * whether a feature is on. While the query is loading, and for keys the
 * server does not list, every feature reads as off: gated UI never flashes
 * in and then disappears.
 *
 * Client gates only hide UI. A feature that does work on the server must also
 * be gated there.
 */

export interface FeatureFlagsContextValue {
  /** Keys enabled for the viewer. */
  enabled: readonly string[]
  /** Keys enabled for the viewer only because they are in admins_only. */
  preview: readonly string[]
  /** Whether the viewer may manage feature flags. */
  isDeveloper: boolean
}

const noFeatures: FeatureFlagsContextValue = {
  enabled: [],
  preview: [],
  isDeveloper: false,
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>(noFeatures)

/** True when the user is an admin with the developer role. */
export const isDeveloperUser = (
  user: { isAdmin: boolean; isDeveloper: boolean } | null | undefined
): boolean => Boolean(user?.isAdmin && user?.isDeveloper)

interface FeatureFlagsProviderProps {
  /** The shared layout query data; undefined while loading. */
  data: SharedLayout_QueryFragment | undefined | null
  children: ReactNode
}

/** Provides the flags of the shared layout query. Used by SharedLayout. */
export function FeatureFlagsProvider({
  data,
  children,
}: FeatureFlagsProviderProps) {
  const enabledList = data?.enabledFeaturesList
  const previewList = data?.adminPreviewFeaturesList
  const isDeveloper = isDeveloperUser(data?.currentUser)
  const value = useMemo<FeatureFlagsContextValue>(() => {
    if (!enabledList && !previewList && !isDeveloper) {
      return noFeatures
    }
    const enabled = (enabledList ?? []).filter(
      (key): key is string => typeof key === "string"
    )
    return {
      enabled,
      // A preview key that is not also enabled is not shown at all.
      preview: (previewList ?? []).filter(
        (key): key is string => typeof key === "string" && enabled.includes(key)
      ),
      isDeveloper,
    }
  }, [enabledList, previewList, isDeveloper])

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  return useContext(FeatureFlagsContext)
}

/** Whether a feature is enabled for the viewer. Off while loading. */
export function useFeature(key: FeatureKey): boolean {
  return useContext(FeatureFlagsContext).enabled.includes(key)
}

/**
 * Whether a feature is enabled for the viewer only because it is in
 * admins_only, i.e. the viewer is an admin previewing it.
 */
export function useFeaturePreview(key: FeatureKey): boolean {
  return useContext(FeatureFlagsContext).preview.includes(key)
}

interface FeatureProps {
  name: FeatureKey
  /**
   * Content while the feature is on. A function receives whether the
   * feature is on only as an admin preview.
   */
  children: ReactNode | ((state: { preview: boolean }) => ReactNode)
  /** Rendered while the feature is off. Nothing by default. */
  fallback?: ReactNode
  /** Render a PreviewTag before the content while it is an admin preview. */
  previewTag?: boolean
}

/** Renders its children only while the feature is enabled for the viewer. */
export function Feature({
  name,
  children,
  fallback = null,
  previewTag = false,
}: FeatureProps) {
  const enabled = useFeature(name)
  const preview = useFeaturePreview(name)
  if (!enabled) {
    return <>{fallback}</>
  }
  const content =
    typeof children === "function" ? children({ preview }) : children
  return (
    <>
      {previewTag && preview ? <PreviewTag /> : null}
      {content}
    </>
  )
}
