export type PoolKind = "root" | "auth"

export interface PoolConfig {
  max: number
  connectionTimeoutMillis: number
}

/*
 * The defaults fit the server and worker into a budget of 10 Postgres
 * connections: root 2 + auth 5 (one of which is held by @graphile/pg-pubsub
 * for LISTEN) + worker 2 (WORKER_POOL_MAX).
 */
const DEFAULT_MAX: Record<PoolKind, number> = {
  root: 2,
  auth: 5,
}
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5000

const MAX_ENV_VAR: Record<PoolKind, string> = {
  root: "DATABASE_POOL_MAX_ROOT",
  auth: "DATABASE_POOL_MAX_AUTH",
}
const ACQUIRE_TIMEOUT_ENV_VAR = "DATABASE_POOL_ACQUIRE_TIMEOUT_MS"

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === "") {
    return fallback
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `process.env.${name} must be a positive integer, got '${raw}'`
    )
  }
  return value
}

/**
 * Size and acquire timeout for a `pg` Pool. A request that cannot get a
 * connection within the timeout fails instead of waiting indefinitely.
 */
export function poolConfig(kind: PoolKind): PoolConfig {
  return {
    max: positiveIntFromEnv(MAX_ENV_VAR[kind], DEFAULT_MAX[kind]),
    connectionTimeoutMillis: positiveIntFromEnv(
      ACQUIRE_TIMEOUT_ENV_VAR,
      DEFAULT_ACQUIRE_TIMEOUT_MS
    ),
  }
}
