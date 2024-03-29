import { format, utcToZonedTime } from "date-fns-tz"
import { QueryBuilder, SQL } from "graphile-build-pg"
import {
  AugmentedGraphQLFieldResolver,
  embed,
  gql,
  makeExtendSchemaPlugin,
} from "graphile-utils"

import { OurGraphQLContext } from "../middleware/installPostGraphile"

// graphile-utils doesn't export this yet
import type { GraphQLResolveInfo } from "graphql"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// The asyncIterator topic for currentTime mutation asyncIterator
const CURRENT_TIME_PUBSUB_TOPIC = "updateTime"
// How often the topic should be updated
const CURRENT_TIME_UPDATE_INTERVAL = 1000

/*
 * PG NOTIFY events are sent via a channel, this function helps us determine
 * which channel to listen to for the currently logged in user by extracting
 * their `user_id` from the GraphQL context.
 *
 * NOTE: channels are limited to 63 characters in length (this is a PostgreSQL
 * limitation).
 */
const currentUserTopicFromContext = async (
  _args: {},
  context: { [key: string]: any },
  _resolveInfo: GraphQLResolveInfo
) => {
  if (context.sessionId /* fail fast */) {
    // We have the users session ID, but to get their actual ID we need to ask the database.
    const {
      rows: [user],
    } = await context.pgClient.query(
      "select app_public.current_user_id() as id"
    )
    if (user) {
      return `graphql:user:${user.id}`
    }
  }
  throw new Error("You're not logged in")
}

const eventRegistrationsTopicFromContext = async (
  args: { eventId: string },
  context: { [key: string]: any },
  _resolveInfo: GraphQLResolveInfo
) => {
  const {
    rows: [event],
  } = await context.pgClient.query(
    "select id from app_public.events where id = $1",
    [args.eventId]
  )
  if (event) {
    return `graphql:eventRegistrations:${event.id}`
  }
  throw new Error("Invalid event ID.")
}

/*
 * This plugin adds a number of custom subscriptions to our schema. By making
 * sure our subscriptions are tightly focussed we can ensure that our schema
 * remains scalable and that developers do not get overwhelmed with too many
 * subscription options being open. You can also use external sources of realtime
 * data when PostgreSQL's LISTEN/NOTIFY is not sufficient.
 *
 * Read more about this in the PostGraphile documentation:
 *
 * https://www.graphile.org/postgraphile/subscriptions/#custom-subscriptions
 *
 * And see the database trigger function `app_public.tg__graphql_subscription()`.
 */
const SubscriptionsPlugin = makeExtendSchemaPlugin((build, { pubsub }) => {
  const { pgSql: sql } = build

  ;(async () => {
    while (true) {
      // pubsub is not available in tests and one off script such as
      // yarn server schema:export.
      //
      // Need to start an actual postgraphile server so that 'pluginHooks'
      // defined in installPostGraphile.ts are run.
      if (pubsub) {
        pubsub.publish(CURRENT_TIME_PUBSUB_TOPIC, new Date())
        await sleep(CURRENT_TIME_UPDATE_INTERVAL)
      } else {
        // Break out of infinite loop if pubsub is not defined
        break
      }
    }
  })()

  return {
    typeDefs: gql`
       type UserSubscriptionPayload {
        user: User # Populated by our resolver below
        event: String # Part of the NOTIFY payload
      }

      type EventRegistrationsSubscriptionPayload {
        registrations(after: Datetime): [Registration]
        event: String
      }

      extend type Subscription {
        """Triggered when the logged in user's record is updated in some way."""
        currentUserUpdated: UserSubscriptionPayload! @pgSubscription(topic: ${embed(
          currentUserTopicFromContext
        )})

        """Triggered when new event registrations are created or updated. Each event has its own subscription topic."""
        eventRegistrations(eventId: UUID!): EventRegistrationsSubscriptionPayload! @pgSubscription(topic: ${embed(
          eventRegistrationsTopicFromContext
        )})

        """Returns the server time every second."""
        currentTime: Date!
      }
    `,
    resolvers: {
      Subscription: {
        currentTime: {
          subscribe() {
            return pubsub.asyncIterator(CURRENT_TIME_PUBSUB_TOPIC)
          },
          resolve(t) {
            const pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"
            const timezonedDate = utcToZonedTime(t, process.env.TZ as string)
            const formatted = format(timezonedDate, pattern, {
              timeZone: process.env.TZ as string,
            })
            return formatted
          },
        },
      },
      UserSubscriptionPayload: {
        user: getByQueryFromTable(
          // Table to select subscription results from
          sql.fragment`app_public.users`,
          ({ tableAlias, event }) =>
            sql.fragment`${tableAlias}.id = ${sql.value(event.subject)}`
        ),
      },
      EventRegistrationsSubscriptionPayload: {
        registrations: getByQueryFromTable(
          // Table to select subscription results from
          sql.fragment`app_public.registrations`,

          // Query that returns the subscription data
          ({ sqlBuilder, tableAlias, event, args }) => {
            const where = sql.fragment`${tableAlias}.event_id = ${sql.value(
              event.subject
            )} and ${tableAlias}.created_at >= ${sql.value(args.after)}`
            const orderBy = sql.fragment`created_at`
            sqlBuilder.where(where)
            sqlBuilder.orderBy(() => orderBy, true)
          },
          // Whether to return a single record or a list.
          // If true, return list.
          true
        ),
      },
    },
  }
})

/* The JSON object that `tg__graphql_subscription()` delivers via NOTIFY */
interface TgGraphQLSubscriptionPayload {
  event: string
  subject: string | null
}

interface ConstructQueryArgs {
  sqlBuilder: QueryBuilder
  tableAlias: SQL
  event: TgGraphQLSubscriptionPayload
  args: any
}

/*
 * This function handles the boilerplate of fetching a record / records from the
 * database which has the 'id' equal to the 'subject' from the PG NOTIFY event
 * payload (see `tg__graphql_subscription()` trigger function in the database).
 */
function getByQueryFromTable(
  sqlTable: SQL,
  constructQuery: (args: ConstructQueryArgs) => void,
  returnList: boolean = false
): AugmentedGraphQLFieldResolver<TgGraphQLSubscriptionPayload, any> {
  return async (
    event: TgGraphQLSubscriptionPayload,
    args: any,
    _context: OurGraphQLContext,
    { graphile: { selectGraphQLResultFromTable } }
  ) => {
    const rows = await selectGraphQLResultFromTable(
      sqlTable,
      (tableAlias: SQL, sqlBuilder: QueryBuilder) => {
        constructQuery({ sqlBuilder, tableAlias, event, args })
      }
    )

    return returnList ? rows : rows[0]
  }
}

export default SubscriptionsPlugin
