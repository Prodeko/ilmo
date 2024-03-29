import { makeWrapResolversPlugin } from "graphile-utils"

import { OurGraphQLContext } from "../middleware/installPostGraphile"

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
          const ipAddress = context.ipAddress
          const { eventId, quotaId } = args.input

          // After successfull registration delete the rate limit key from redis
          workerUtils.addJob("registration__delete_rate_limit_key", {
            eventId,
            quotaId,
            ipAddress,
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
