import type { FeatureKey } from "@app/lib"
import type { JobHelpers, Task } from "graphile-worker"

/**
 * Runs `task` only while the feature is enabled, checked when the job runs
 * rather than when it was queued. A job that runs while the feature is off
 * completes without doing anything; it is not retried later.
 *
 * Jobs have no user session, so a flag in `admins_only` counts as off here,
 * exactly as `app_public.feature_enabled()` evaluates it for an anonymous
 * caller.
 */
export function withFeature<P = unknown>(
  key: FeatureKey,
  task: (payload: P, helpers: JobHelpers) => void | Promise<void>
): Task {
  return async (payload, helpers) => {
    const {
      rows: [row],
    } = await helpers.query<{ enabled: boolean }>(
      "select app_public.feature_enabled($1) as enabled",
      [key]
    )
    if (!row?.enabled) {
      helpers.logger.info(
        `Skipping ${helpers.job.task_identifier}: feature "${key}" is off`
      )
      return
    }
    return task(payload as P, helpers)
  }
}
