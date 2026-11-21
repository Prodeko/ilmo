import {
  featureConfigured,
  FeatureDefinition,
  FeatureKey,
  FEATURES,
} from "@app/lib"
import { Pool } from "pg"

/**
 * Server-side reads of the feature flags in `app_public.feature_flags`.
 *
 * The database decides: `app_public.feature_enabled(key)` is evaluated for
 * every row through the root pool, which has no user session, so the result
 * is "enabled for everyone". `admins_only` is added on top only for callers
 * that pass `asAdmin` because they have already established that the request
 * comes from an admin.
 *
 * The answers are cached in-process for `FEATURE_FLAG_CACHE_TTL_MS`. There is
 * deliberately no LISTEN connection: the root pool is small and one permanent
 * connection would take a large share of it. Instead the cache is invalidated
 * whenever the `setFeatureFlag` mutation passes through this server (see
 * FeatureFlagsPlugin), so a switch made here is visible on the next request
 * after it commits, and one made elsewhere within the TTL.
 */

export const FEATURE_FLAG_CACHE_TTL_MS = 5000

interface FlagSnapshot {
  /** `feature_enabled(key)` for a visitor without a session. */
  enabled: boolean
  /** True when the flag is available, not retired and in `admins_only`. */
  adminsOnly: boolean
}

export interface FeatureFlagReader {
  isFeatureEnabled(
    key: FeatureKey,
    options?: { asAdmin?: boolean }
  ): Promise<boolean>
  invalidate(): void
}

export function createFeatureFlagReader(
  pool: Pick<Pool, "query">,
  {
    ttlMs = FEATURE_FLAG_CACHE_TTL_MS,
    now = Date.now,
  }: { ttlMs?: number; now?: () => number } = {}
): FeatureFlagReader {
  let snapshot: Map<string, FlagSnapshot> | null = null
  let fetchedAt = 0
  // Bumped by invalidate() so that a load that started before the
  // invalidation cannot store its (possibly stale) result afterwards.
  let generation = 0
  let inFlight: Promise<Map<string, FlagSnapshot>> | null = null

  const load = async (): Promise<Map<string, FlagSnapshot>> => {
    const startedGeneration = generation
    const { rows } = await pool.query<{
      key: string
      enabled: boolean
      admins_only: boolean
    }>(
      `select
         f.key,
         app_public.feature_enabled(f.key) as enabled,
         (f.retired_at is null and f.available and f.state = 'admins_only') as admins_only
       from app_public.feature_flags as f`
    )
    const loaded = new Map(
      rows.map((row) => [
        row.key,
        { enabled: row.enabled, adminsOnly: row.admins_only },
      ])
    )
    if (startedGeneration === generation) {
      snapshot = loaded
      fetchedAt = now()
    }
    return loaded
  }

  const current = async () => {
    if (snapshot && now() - fetchedAt < ttlMs) {
      return snapshot
    }
    if (!inFlight) {
      const loading: Promise<Map<string, FlagSnapshot>> = load().finally(() => {
        if (inFlight === loading) {
          inFlight = null
        }
      })
      inFlight = loading
    }
    return inFlight
  }

  return {
    async isFeatureEnabled(key, { asAdmin = false } = {}) {
      const flag = (await current()).get(key)
      if (!flag) {
        // Unknown keys read as off, as they do in the database.
        return false
      }
      return flag.enabled || (asAdmin && flag.adminsOnly)
    },
    invalidate() {
      generation++
      snapshot = null
      inFlight = null
    },
  }
}

let reader: FeatureFlagReader | null = null

/**
 * Points the module-level helpers at the root pool. Called once at boot by
 * the installFeatureFlags middleware, and by the jest helpers.
 */
export function configureFeatureFlags(pool: Pick<Pool, "query">) {
  reader = createFeatureFlagReader(pool)
}

/**
 * Whether a feature is enabled. Pass `asAdmin: true` only when the caller
 * already knows the request comes from an admin; `admins_only` flags are then
 * on as well.
 */
export function isFeatureEnabled(
  key: FeatureKey,
  options?: { asAdmin?: boolean }
): Promise<boolean> {
  if (!reader) {
    throw new Error(
      "isFeatureEnabled was called before configureFeatureFlags(rootPgPool)"
    )
  }
  return reader.isFeatureEnabled(key, options)
}

/** Drops the cached flag states so that the next read goes to the database. */
export function invalidateFeatureFlags() {
  reader?.invalidate()
}

/**
 * Records in `feature_flags.available` whether this server has the
 * configuration each integration-backed feature needs (see `requiresEnv` in
 * the registry). Features without requirements are left alone. Returns what
 * was written, and the keys whose row is missing (the migration that adds the
 * feature has not run).
 */
export async function syncFeatureAvailability(
  pool: Pick<Pool, "query">,
  {
    env = process.env,
    features = FEATURES,
  }: {
    env?: Record<string, string | undefined>
    features?: Record<string, FeatureDefinition>
  } = {}
): Promise<{ available: Record<string, boolean>; missing: string[] }> {
  const available: Record<string, boolean> = {}
  const missing: string[] = []
  for (const [key, definition] of Object.entries(features)) {
    if (!definition.requiresEnv?.length) {
      continue
    }
    const configured = featureConfigured(definition, env)
    const {
      rows: [row],
    } = await pool.query<{ found: boolean }>(
      "select app_private.set_feature_available($1, $2) as found",
      [key, configured]
    )
    if (row?.found) {
      available[key] = configured
    } else {
      missing.push(key)
    }
  }
  return { available, missing }
}

/**
 * Whether a feature is enabled for the user of a GraphQL request: on for
 * everyone, or `admins_only` and the request's session belongs to an admin.
 * `pgClient` is the request's client, which carries the session; it is
 * queried only when the flag is not on for everyone.
 */
export async function isFeatureEnabledForSession(
  key: FeatureKey,
  pgClient: { query: Pool["query"] }
): Promise<boolean> {
  if (await isFeatureEnabled(key)) {
    return true
  }
  if (!(await isFeatureEnabled(key, { asAdmin: true }))) {
    return false
  }
  const {
    rows: [row],
  } = await pgClient.query<{ is_admin: boolean }>(
    "select app_public.current_user_is_admin() as is_admin"
  )
  return Boolean(row?.is_admin)
}
