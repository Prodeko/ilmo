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
    const key = constructRateLimitKey(fieldName, eventId, ipAddress);
    const current = await redisClient.incr(key);

    if (current > limit) {
      throw new Error("Too many requests.");
    } else {
      await redisClient.expire(key, RATE_LIMIT_TIMEOUT);
    }
    return await resolve();
  };
}

const RateLimitPlugin = makeWrapResolversPlugin({
  Mutation: {
    claimRegistrationToken: rateLimitResolver(1),
    // If more resolvers need rate limiting in the future
    // they can be added here.
  },
});

export default RateLimitPlugin;
