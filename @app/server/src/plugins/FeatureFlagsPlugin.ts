import { makeWrapResolversPlugin } from "graphile-utils"

import { invalidateFeatureFlags } from "../utils/featureFlags"

/**
 * Clears the server's feature flag cache when a flag is switched through this
 * server, so that server-side gates follow the switch without waiting for the
 * cache to expire.
 *
 * The resolver returns shortly before PostGraphile commits the request's
 * transaction. A flag read by another request in that gap can still cache the
 * old state, but for no longer than the cache TTL, which is the same bound as
 * for a switch made outside this server.
 */
const FeatureFlagsPlugin = makeWrapResolversPlugin({
  Mutation: {
    setFeatureFlag: {
      async resolve(resolve: any, _source, _args, _context, _resolveInfo) {
        const result = await resolve()
        invalidateFeatureFlags()
        return result
      },
    },
  },
})

export default FeatureFlagsPlugin
