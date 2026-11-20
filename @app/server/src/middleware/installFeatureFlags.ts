import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

import {
  configureFeatureFlags,
  syncFeatureAvailability,
} from "../utils/featureFlags"

/**
 * Makes `isFeatureEnabled` read through the root pool, and records at boot
 * which integration-backed features this server is configured for. Must be
 * registered after installDatabasePools.
 */
const FeatureFlags: FastifyPluginAsync = async (app) => {
  configureFeatureFlags(app.rootPgPool)

  try {
    const { available, missing } = await syncFeatureAvailability(app.rootPgPool)
    for (const [key, isAvailable] of Object.entries(available)) {
      if (!isAvailable) {
        app.log.warn(
          { feature: key },
          "feature is not configured on this server and stays off until its environment variables are set"
        )
      }
    }
    if (missing.length > 0) {
      app.log.error(
        { features: missing },
        "feature flags in the registry have no row in app_public.feature_flags; have all migrations run?"
      )
    }
  } catch (e) {
    // The server starts even when the database is not reachable yet (see
    // retryOnInitFail); the flags then keep the availability recorded by the
    // previous boot.
    app.log.error(
      { err: e },
      "could not record feature availability in the database"
    )
  }
}

export default fp(FeatureFlags)
