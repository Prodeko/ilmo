import { makeWrapResolversPlugin } from "graphile-utils"

import { OurGraphQLContext } from "../middleware/installPostGraphile"

import { constructRateLimitKey, rateLimitRequester } from "./RateLimitPlugin"

const EventRegistrationPlugin = makeWrapResolversPlugin({
  Mutation: {
    createRegistration: {
      async resolve(
        resolve: any,
        _user,
        args,
        context: OurGraphQLContext,
        _resolveInfo
      ) {
        // The pgClient on context is already in a transaction configured for the user
        const { pgClient } = context

        // Create a savepoint we can roll back to
        await pgClient.query("SAVEPOINT registration_wrapper")
        try {
          // Run the original resolver
          const result = await resolve()

          const workerUtils = context.workerUtils
          const { eventId, quotaId } = args.input
          const requester = await rateLimitRequester(
            pgClient,
            context.ipAddress
          )
          const key = constructRateLimitKey(
            "claimRegistrationToken",
            `${eventId}:${quotaId}`,
            requester
          )

          // After successfull registration delete the rate limit key from redis.
          // Awaiting here ensures the job row is committed before this resolver
          // returns; under graphile-worker 0.16 the add_job SQL function does
          // more work (normalizing into _private_tasks) than in 0.13, and the
          // unawaited fire-and-forget pattern raced the test queries that
          // immediately read the queue.
          await workerUtils.addJob("registration__delete_rate_limit_key", {
            key,
          })

          // Return the result of our original mutation
          return result
        } catch (e) {
          await pgClient.query("ROLLBACK TO SAVEPOINT registration_wrapper")
          // Re-throw the error so the GraphQL client knows about it
          throw e
        } finally {
          await pgClient.query("RELEASE SAVEPOINT registration_wrapper")
        }
      },
    },
  },
})

export default EventRegistrationPlugin
