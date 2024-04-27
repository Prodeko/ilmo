import { IncomingMessage } from "http"

import { FastifyRedis } from "@fastify/redis"
import PersistedOperationsPlugin from "@graphile/persisted-operations"
import PgPubsub from "@graphile/pg-pubsub"
import PgSubscriptionsLds from "@graphile/subscriptions-lds"
import PgSimplifyInflectorPlugin from "@graphile-contrib/pg-simplify-inflector"
import { parse } from "cookie"
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import { NodePlugin } from "graphile-build"
import { WorkerUtils } from "graphile-worker"
import { resolve } from "node:path"
import { Pool, PoolClient } from "pg"
import {
  enhanceHttpServerWithSubscriptions,
  makePluginHook,
  Middleware,
  postgraphile,
  PostGraphileOptions,
} from "postgraphile"
import { makePgSmartTagsFromFilePlugin } from "postgraphile/plugins"
import ConnectionFilterPlugin from "postgraphile-plugin-connection-filter"

import { convertHandler } from "../app"
import {
  EmailsPlugin,
  EventRegistrationPlugin,
  OrdersPlugin,
  PassportLoginPlugin,
  PasswordStrengthPlugin,
  PrimaryKeyMutationsOnlyPlugin,
  RateLimitPlugin,
  RemoveOwnershipInfoForeignKeyConnections,
  RemoveQueryQueryPlugin,
  SubscriptionsPlugin,
  TranslatePlugin,
  UploadsPlugin,
  ValidateRichTextFields,
} from "../plugins"
import { resolveUpload } from "../utils/fileUpload"
import handleErrors from "../utils/handleErrors"

const PostGraphileUploadFieldPlugin = require("postgraphile-plugin-upload-field")

export interface OurGraphQLContext {
  pgClient: PoolClient
  sessionId: string | null
  ipAddress: string
  rootPgPool: Pool
  redisClient: FastifyRedis
  workerUtils: WorkerUtils
  login(user: any): Promise<void>
  logout(): Promise<void>
}

const TagsFilePlugin = makePgSmartTagsFromFilePlugin(
  // We're using JSONC for VSCode compatibility; also using an explicit file
  // path keeps the tests happy.
  resolve(__dirname, "../../postgraphile.tags.jsonc")
)

type UUID = string

const isDev = process.env.NODE_ENV === "development"
const isJestTest = process.env.IN_TESTS === "1"

function uuidOrNull(input: string | number | null | undefined): UUID | null {
  if (!input) return null
  const str = String(input)
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      str
    )
  ) {
    return str
  } else {
    return null
  }
}

function sessionIdFromRequest(
  app: FastifyInstance,
  req: IncomingMessage | FastifyRequest
) {
  // If we are in Jest tests, return sessionId from MockReq options
  // @ts-ignore
  if (isJestTest) return req?.user?.sessionId
  const sessionCookie = parse(req.headers?.cookie || "")?.["session"]
  const decodedSession = app.decodeSecureSession(sessionCookie)
  const sessionId = uuidOrNull(decodedSession?.get("passport"))
  return sessionId
}

const pluginHook = makePluginHook([
  // Add the pub/sub realtime provider
  PgPubsub,

  // Implements a query allowlist. Only queries in the allowlist can be executed
  // in production
  PersistedOperationsPlugin,
])

// redisClient is set as an optional property here since it is not needed
// in @app/server/scripts/schema-export.ts. For normal server startup it is required.
// Same with workerUtils.
interface PostGraphileOptionsOptions {
  app?: FastifyInstance
  websocketMiddlewares?: Middleware[]
  rootPgPool: Pool
  redisClient?: FastifyRedis
  workerUtils?: WorkerUtils
}

export function getPostGraphileOptions({
  app,
  websocketMiddlewares,
  rootPgPool,
  redisClient,
  workerUtils,
}: PostGraphileOptionsOptions) {
  const options: PostGraphileOptions = {
    // This is for PostGraphile server plugins: https://www.graphile.org/postgraphile/plugins/
    pluginHook,

    // This is so that PostGraphile installs the watch fixtures, it's also needed to enable live queries
    ownerConnectionString: process.env.DATABASE_URL,

    // On production we still want to start even if the database isn't available.
    // On development, we want to deal nicely with issues in the database.
    // For these reasons, we're going to keep retryOnInitFail enabled for both environments.
    retryOnInitFail: !isJestTest,

    // Add websocket support to the PostGraphile server
    subscriptions: true,
    websockets: ["v1"],
    websocketMiddlewares,

    // Support for Postgraphile live queries @graphile/subscriptions-lds
    live: !isJestTest,

    // We don't enable query batching since urql doesn't support it, and we don't really need it
    enableQueryBatching: false,

    // dynamicJson: instead of inputting/outputting JSON as strings, input/output raw JSON objects
    dynamicJson: true,

    // ignoreRBAC=false: honour the permissions in your DB - don't expose what you don't GRANT
    ignoreRBAC: false,

    // ignoreIndexes=false: honour your DB indexes - only expose things that are fast
    ignoreIndexes: false,

    // setofFunctionsContainNulls=false: reduces the number of nulls in your schema
    setofFunctionsContainNulls: false,

    // Enable GraphiQL in development
    graphiql: isDev || !!process.env.ENABLE_GRAPHIQL,
    // Use a fancier GraphiQL with `prettier` for formatting, and header editing.
    enhanceGraphiql: true,
    // Allow EXPLAIN in development (you can replace this with a callback function if you want more control)
    allowExplain: isDev,

    // Disable query logging
    disableQueryLog: true,

    // Custom error handling
    handleErrors,
    /*
     * To use the built in PostGraphile error handling, you can use the
     * following code instead of `handleErrors` above. Using `handleErrors`
     * gives you much more control (and stability) over how errors are
     * output to the user.
     */
    /*
        // See https://www.graphile.org/postgraphile/debugging/
        extendedErrors:
          isDev || isTest
            ? [
                "errcode",
                "severity",
                "detail",
                "hint",
                "positon",
                "internalPosition",
                "internalQuery",
                "where",
                "schema",
                "table",
                "column",
                "dataType",
                "constraint",
              ]
            : ["errcode"],
        showErrorStack: isDev || isTest,
        */

    // Automatically update GraphQL schema when database changes
    watchPg: isDev,

    // Keep data/schema.graphql up to date
    sortExport: true,
    exportGqlSchemaPath: isDev
      ? `${__dirname}/../../../../data/schema.graphql`
      : undefined,

    // @graphile/persisted-operations options
    persistedOperationsDirectory: resolve(
      `${__dirname}../../../../graphql/.persisted_operations/`
    ),
    allowUnpersistedOperation(req, payload) {
      const query = req?.body?.query
      // urql doesn't support persisted mutations: https://github.com/FormidableLabs/urql/issues/1287.
      const isMutation = query?.startsWith("mutation")
      // Postgraphile 4.12.4 adds support for persisted subscriptions via graphql-ws
      // but urql doesn't support it
      const isSubscription = (payload?.query as string)?.startsWith(
        "subscription"
      )
      const isIntroSpectionQuery = query?.startsWith("query IntrospectionQuery")

      if (isMutation || isSubscription || isIntroSpectionQuery) {
        return true
      }
      // Allow arbitrary requests to be made via GraphiQL in development
      return (process.env.NODE_ENV === "development" &&
        req.headers.referer?.endsWith("/graphiql"))!
    },

    /*
     * Plugins to enhance the GraphQL schema, see:
     *   https://www.graphile.org/postgraphile/extending/
     */
    appendPlugins: [
      // Plugin for rate limiting resolvers
      RateLimitPlugin,

      // Wrap createRegistration mutation
      EventRegistrationPlugin,

      // Render email templates
      EmailsPlugin,

      // Handle GraphQL uploads
      UploadsPlugin,

      // PostGraphile adds a `query: Query` field to `Query` for Relay 1
      // compatibility. We don't need that.
      RemoveQueryQueryPlugin,

      // Adds support for our `postgraphile.tags.json5` file
      TagsFilePlugin,

      // Translate text with Azure Translator API
      TranslatePlugin,

      // Adds a filter argument for advanced filtering of Connections
      ConnectionFilterPlugin,

      // File uploads
      PostGraphileUploadFieldPlugin,

      // Simplifies the field names generated by PostGraphile
      PgSimplifyInflectorPlugin,

      // Omits by default non-primary-key constraint mutations
      PrimaryKeyMutationsOnlyPlugin,

      // Adds the `login` mutation to enable users to log in
      PassportLoginPlugin,

      // Calculate password strength with zxcvbn-ts on the server side
      PasswordStrengthPlugin,

      // Remove connections based on ownership information from the schema.
      // For example: eventCategoriesByCreatedBy, eventCategoriesByUpdatedBy etc.
      RemoveOwnershipInfoForeignKeyConnections,

      // Validate that event description
      ValidateRichTextFields,

      // Adds realtime features to our GraphQL schema
      SubscriptionsPlugin,

      // Support for live queries https://www.graphile.org/postgraphile/live-queries/
      // PgSubscriptionsLds pjolls for changes every 500ms, so in order for jest tests
      // to cleanly exit we have to exclude this plugin when running tests.
      !isJestTest ? PgSubscriptionsLds : null,

      // Adds custom orders to our GraphQL schema
      OrdersPlugin,
    ].filter(Boolean),

    /*
     * Plugins we don't want in our schema
     */
    skipPlugins: [
      // Disable the 'Node' interface
      NodePlugin,
    ],

    graphileBuildOptions: {
      /*
       * Any properties here are merged into the settings passed to each Graphile
       * Engine plugin - useful for configuring how the plugins operate.
       */

      // Makes all SQL function arguments except those with defaults non-nullable
      pgStrictFunctions: true,
      uploadFieldDefinitions: [
        {
          match: ({ column }: { column: string }) =>
            column === "header_image_file",
          resolve: resolveUpload,
        },
      ],
    },

    /*
     * Postgres transaction settings for each GraphQL query/mutation to
     * indicate to Postgres who is attempting to access the resources. These
     * will be referenced by RLS policies/triggers/etc.
     *
     * Settings set here will be set using the equivalent of `SET LOCAL`, so
     * certain things are not allowed. You can override Postgres settings such
     * as 'role' and 'search_path' here; but for settings indicating the
     * current user, session id, or other privileges to be used by RLS policies
     * the setting names must contain at least one and at most two period
     * symbols (`.`), and the first segment must not clash with any Postgres or
     * extension settings. We find `jwt.claims.*` to be a safe namespace,
     * whether or not you're using JWTs.
     */
    async pgSettings(req) {
      const sessionId = sessionIdFromRequest(app!, req)
      if (sessionId) {
        // Update the last_active timestamp (but only do it at most once every 15 seconds to avoid too much churn).
        await rootPgPool.query(
          "UPDATE app_private.sessions SET last_active = NOW() WHERE uuid = $1 AND last_active < NOW() - INTERVAL '15 seconds'",
          [sessionId]
        )
      }
      return {
        // Everyone uses the "visitor" role currently
        role: process.env.DATABASE_VISITOR,

        /*
         * Note, though this says "jwt" it's not actually anything to do with
         * JWTs, we just know it's a safe namespace to use, and it means you
         * can use JWTs too, if you like, and they'll use the same settings
         * names reducing the amount of code you need to write.
         */
        "jwt.claims.session_id": sessionId,
      }
    },

    /*
     * These properties are merged into context (the third argument to GraphQL
     * resolvers). This is useful if you write your own plugins that need
     * access to, e.g., the logged in user.
     */
    async additionalGraphQLContextFromRequest(
      req
    ): Promise<Partial<OurGraphQLContext>> {
      const sessionId = sessionIdFromRequest(app!, req)
      const fastifyRequest = req._fastifyRequest as FastifyRequest
      const ipAddress = fastifyRequest?.ip

      return {
        // The current session id
        sessionId,

        ipAddress,

        // Needed by RateLimitPlugin
        redisClient,

        // Pass workerUtils to GraphQLContext so we can
        // run worker jobs from plugins
        workerUtils,

        // Needed so passport can write to the database
        rootPgPool,

        // Use these to tell Passport.js we're logged in / out
        login: async (user: any) => await fastifyRequest.logIn(user),
        logout: () => fastifyRequest.logOut(),
      }
    },
  }
  return options
}

const Postgraphphile: FastifyPluginAsync = async (app) => {
  const {
    websocketMiddlewares,
    redis: redisClient,
    authPgPool,
    rootPgPool,
    workerUtils,
  } = app

  const middleware = postgraphile(
    // @ts-expect-error: postgraphile decorates pool with some extra stuff
    authPgPool,
    "app_public",
    getPostGraphileOptions({
      app,
      websocketMiddlewares,
      rootPgPool,
      redisClient,
      workerUtils,
    })
  )

  app.options(
    middleware.graphqlRoute,
    convertHandler(middleware.graphqlRouteHandler)
  )

  app.post(
    middleware.graphqlRoute,
    convertHandler(middleware.graphqlRouteHandler)
  )

  // GraphiQL
  if (middleware.options.graphiql) {
    if (middleware.graphiqlRouteHandler) {
      app.head(
        middleware.graphiqlRoute,
        convertHandler(middleware.graphiqlRouteHandler)
      )
      app.get(
        middleware.graphiqlRoute,
        convertHandler(middleware.graphiqlRouteHandler)
      )
    }
  }

  if (middleware.options.watchPg) {
    if (middleware.eventStreamRouteHandler) {
      app.options(
        middleware.eventStreamRoute,
        convertHandler(middleware.eventStreamRouteHandler)
      )
      app.get(
        middleware.eventStreamRoute,
        convertHandler(middleware.eventStreamRouteHandler)
      )
    }
  }

  const httpServer = app.httpServer
  if (httpServer) {
    enhanceHttpServerWithSubscriptions(httpServer, middleware)
  }
}

export default fp(Postgraphphile)
