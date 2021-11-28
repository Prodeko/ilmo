import { makeWrapResolversPlugin } from "graphile-utils"

import { OurGraphQLContext } from "../middleware/installPostGraphile"

if (!process.env.NODE_ENV) {
  throw new Error("No NODE_ENV envvar! Try `export NODE_ENV=development`")
}

// 30 minutes timeout
const RATE_LIMIT_TIMEOUT = 30

function constructRateLimitKey(
  fieldName: string,
  id: string,
  ipAddress: string
) {
  return `rate-limit:${fieldName}:${id}:${ipAddress}`
}

class RateLimitException extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.code = "RLIMIT"
  }
}

function rateLimitResolver(
  limit: number,
  rateLimitIdFromInputFields: string[]
) {
  return async (
    resolve,
    _source,
    args,
    context: OurGraphQLContext,
    resolveInfo
  ) => {
    const { pgClient, ipAddress, redisClient } = context
    const rateLimitId = rateLimitIdFromInputFields
      .map((field) => args.input[field])
      .join(":")
    const { fieldName } = resolveInfo

    // Create a savepoint we can roll back to
    await pgClient.query("SAVEPOINT ratelimit_wrapper")
    try {
      // First run the resolver, if it throws an error we don't want
      // to set a rate limit key to redis
      const result = await resolve()

      const key = constructRateLimitKey(fieldName, rateLimitId, ipAddress)
      const current = Number(await redisClient.get(key))

      if (current >= limit) {
        throw new RateLimitException(
          `Too many requests. You have been rate-limited for ${RATE_LIMIT_TIMEOUT} minutes.`
        )
      }

      if (current < limit) {
        await redisClient.incr(key)
        await redisClient.expire(key, RATE_LIMIT_TIMEOUT * 60)
      }

      return result
    } catch (e) {
      await pgClient.query("ROLLBACK TO SAVEPOINT ratelimit_wrapper")
      // Re-throw the error so the GraphQL client knows about it
      throw e
    } finally {
      await pgClient.query("RELEASE SAVEPOINT ratelimit_wrapper")
    }
  }
}

const RateLimitPlugin = makeWrapResolversPlugin({
  Mutation: {
    // More mutations and queries that need rate limiting can be added here
    claimRegistrationToken: rateLimitResolver(3, ["eventId", "quotaId"]),
  },
})

export default RateLimitPlugin
