import { makeWrapResolversPlugin } from "graphile-utils";
import { GraphQLResolveInfo } from "graphql";

import { OurGraphQLContext } from "../middleware/installPostGraphile";

if (!process.env.NODE_ENV) {
  throw new Error("No NODE_ENV envvar! Try `export NODE_ENV=development`");
}

type AugmentedGraphQLFieldResolver<
  TSource,
  TContext,
  TArgs = { [argName: string]: any }
> = (
  resolve: any,
  source: TSource,
  args: TArgs,
  context: TContext,
  resolveInfo: GraphQLResolveInfo
) => any;

// 30 minutes timeout
const RATE_LIMIT_TIMEOUT = 60 * 30;

function constructRateLimitKey(
  fieldName: string,
  id: string,
  ipAddress: string
) {
  return `rate-limit:${fieldName}:${id}:${ipAddress}`;
}
class RateLimitException extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.code = "RLIMIT";
  }
}

function rateLimitResolver(
  limit: number
): AugmentedGraphQLFieldResolver<{}, OurGraphQLContext, any> {
  return async (
    resolve,
    _source,
    { input: { eventId } },
    { ipAddress, redisClient },
    { fieldName }
  ) => {
    try {
      // First run the resolver, if it throws an error we don't want
      // to set a rate limit key to redis
      const result = await resolve();

      const key = constructRateLimitKey(fieldName, eventId, ipAddress);
      const current = Number(await redisClient.get(key));

      if (current >= limit) {
        throw new RateLimitException(
          `Too many requests. You have been rate-limited for ${
            RATE_LIMIT_TIMEOUT / 60
          } minutes.`
        );
      }

      if (current < limit) {
        await redisClient.incr(key);
        await redisClient.expire(key, RATE_LIMIT_TIMEOUT);
      }

      return result;
    } catch (e) {
      throw e;
    }
  };
}

const RateLimitPlugin = makeWrapResolversPlugin({
  Mutation: {
    claimRegistrationToken: rateLimitResolver(3),
    // If more resolvers need rate limiting in the future
    // they can be added here.
  },
});

export default RateLimitPlugin;
