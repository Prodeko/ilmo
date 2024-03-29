import { IncomingMessage, ServerResponse } from "http"

import { QuestionType } from "@app/graphql"
import { FastifyRedis } from "@fastify/redis"
import { makeWorkerUtils, WorkerUtils } from "graphile-worker"
import {
  DocumentNode,
  ExecutionResult,
  graphql,
  GraphQLSchema,
  print,
} from "graphql"
import Redis from "ioredis"
import camelCase from "lodash/camelCase"
import { Pool, PoolClient } from "pg"
import {
  createPostGraphileSchema,
  PostGraphileOptions,
  withPostGraphileContext,
} from "postgraphile"

import {
  createEventCategories,
  createEvents,
  createOrganizations,
  createQuestions,
  createQuotas,
  createRegistrations,
  createRegistrationSecrets,
  createSession,
  createUsers,
  poolFromUrl,
  refreshMaterializedView,
  TEST_DATABASE_URL,
} from "../../__tests__/helpers"
import { getPostGraphileOptions } from "../src/middleware/installPostGraphile"

export * from "../../__tests__/helpers"

const MockReq = require("mock-req")

interface CreateUserAndLogInArgs {
  isAdmin?: boolean
}

export async function createUserAndLogIn(args?: CreateUserAndLogInArgs) {
  const { isAdmin = false } = args || {}
  const pool = poolFromUrl(TEST_DATABASE_URL!)
  const client = await pool.connect()
  try {
    const [user] = await createUsers(client, 1, true, isAdmin)
    const session = await createSession(client, user.id)

    return { user, session }
  } finally {
    client.release()
  }
}

interface CreateEventDataAndLogin {
  userOptions?: {
    create: boolean
    amount?: number
    isVerified?: boolean
    isAdmin?: boolean
  }
  organizationOptions?: {
    create: boolean
    amount?: number
  }
  eventCategoryOptions?: {
    create: boolean
    amount?: number
  }
  eventOptions?: {
    create: boolean
    amount?: number
    signupOpen?: boolean
    times?: Date[]
    isDraft?: boolean
    openQuotaSize?: number
  }
  quotaOptions?: { create: boolean; size?: number; amount?: number }
  questionOptions?: {
    create: boolean
    amount?: number
    required?: boolean
    type?: QuestionType
  }
  registrationOptions?: { create: boolean; amount?: number }
}

export async function createEventDataAndLogin(args?: CreateEventDataAndLogin) {
  const {
    userOptions = {
      create: true,
      amount: 1,
      isVerified: true,
      isAdmin: false,
    },
    organizationOptions = {
      create: true,
      amount: 1,
    },
    eventCategoryOptions = {
      create: true,
      amount: 1,
    },
    eventOptions = {
      create: true,
      amount: 1,
      signupOpen: true,
      times: undefined,
      isDraft: false,
    },
    quotaOptions = { create: true, amount: 1 },
    questionOptions = { create: true, amount: 1, required: true },
    registrationOptions = { create: true, amount: 1 },
  } = args || {}
  const pool = poolFromUrl(TEST_DATABASE_URL)
  const client = await pool.connect()
  try {
    // Have to begin a transaction here, since we set the third parameter
    // of set_config to 'true' in becomeUser below
    // https://www.postgresql.org/docs/9.3/functions-admin.html
    client.query("BEGIN")

    let users: Awaited<ReturnType<typeof createUsers>>
    if (userOptions.create) {
      users = await createUsers(
        client,
        userOptions.amount,
        userOptions.isVerified,
        userOptions.isAdmin
      )
    }
    const primaryUser = users[0]

    // Use the first user as the one to create the session for. We can
    // then use the other user to test for example RLS policies
    const session = await createSession(client, primaryUser.id)

    await becomeUser(client, session.uuid)

    let organizations: Awaited<ReturnType<typeof createOrganizations>>
    if (organizationOptions.create) {
      organizations = await createOrganizations(
        client,
        organizationOptions.amount
      )
    }
    const primaryOrganization = organizations?.[0]

    let eventCategories: Awaited<ReturnType<typeof createEventCategories>>
    if (eventCategoryOptions.create) {
      eventCategories = await createEventCategories(
        client,
        eventCategoryOptions.amount,
        primaryOrganization.id
      )
    }
    const primaryEventCategory = eventCategories?.[0]

    let events: Awaited<ReturnType<typeof createEvents>>
    if (eventOptions.create) {
      events = await createEvents(
        client,
        eventOptions.amount,
        primaryOrganization.id,
        primaryEventCategory.id,
        eventOptions.signupOpen,
        eventOptions.isDraft,
        eventOptions.openQuotaSize,
        eventOptions.times
      )
    }

    // Become root to bypass RLS policy on app_private.registration_secrets
    // and app_public.quotas
    await client.query("reset role")

    let quotas: Awaited<ReturnType<typeof createQuotas>>
    if (quotaOptions.create) {
      quotas = await createQuotas(
        client,
        quotaOptions.amount,
        events[0].id,
        quotaOptions.size
      )
    }

    let questions: Awaited<ReturnType<typeof createQuestions>>
    if (questionOptions.create) {
      questions = await createQuestions(
        client,
        questionOptions.amount,
        events[0].id,
        questionOptions.required ?? false,
        questionOptions.type
      )
    }

    // We need an existing registration for updateRegistration.test.ts but
    // don't want to create a registration for createRegistration.test.ts
    // since that would create another registration__send_confirmation_email
    // task.
    let registrations: Awaited<ReturnType<typeof createRegistrations>>
    if (registrationOptions.create) {
      registrations = await createRegistrations(
        client,
        registrationOptions.amount,
        events[0].id,
        quotas[0].id,
        questions
      )
    }

    let registrationSecrets: Awaited<
      ReturnType<typeof createRegistrationSecrets>
    >
    if (registrationOptions.create) {
      registrationSecrets = await createRegistrationSecrets(
        client,
        registrations || [],
        events[0].id,
        quotas[0].id
      )
    }

    await refreshMaterializedView(client)

    await client.query("commit")
    return {
      users,
      session,
      organization: primaryOrganization,
      eventCategory: primaryEventCategory,
      events,
      quotas,
      questions,
      registrationSecrets,
      registrations,
    }
  } finally {
    await client.release()
  }
}

export const becomeUser = async (
  client: PoolClient,
  sessionId: string | null
) => {
  await client.query(
    `select set_config('role', $1::text, true), set_config('jwt.claims.session_id', $2::text, true)`,
    [process.env.DATABASE_VISITOR, sessionId]
  )
}

const randomColumns = [
  "name",
  "slug",
  "description",
  "title",
  "location",
  "color",
  "headerImageFile",
  "size",
  "answers",
]

let known: Record<string, { counter: number; values: Map<unknown, string> }> =
  {}

beforeEach(() => {
  known = {}
})
/*
 * This function replaces values that are expected to change with static
 * placeholders so that our snapshot testing doesn't throw an error
 * every time we run the tests because time has ticked on in it's inevitable
 * march toward the future.
 */
export function sanitize(json: any): any {
  /* This allows us to maintain stable references whilst dealing with variable values */
  function mask(value: unknown, type: string) {
    if (!known[type]) {
      known[type] = { counter: 0, values: new Map() }
    }
    const o = known[type]
    if (!o.values.has(value)) {
      o.values.set(value, `[${type}-${++o.counter}]`)
    }
    return o.values.get(value)
  }

  if (Array.isArray(json)) {
    return json.map((val) => sanitize(val))
  } else if (json && typeof json === "object") {
    const result = { ...json }
    for (const k in result) {
      if (k === "nodeId" && typeof result[k] === "string") {
        result[k] = mask(result[k], "nodeId")
      } else if (
        k === "id" ||
        k === "uuid" ||
        (k.endsWith("Id") &&
          (typeof json[k] === "number" || typeof json[k] === "string")) ||
        (k.endsWith("Uuid") && typeof k === "string") ||
        k.endsWith("Token") ||
        k.endsWith("By")
      ) {
        result[k] = mask(result[k], "id")
      } else if (
        (k.endsWith("At") || k.endsWith("Time") || k === "datetime") &&
        typeof json[k] === "string"
      ) {
        result[k] = mask(result[k], "timestamp")
      } else if (
        k.match(/^deleted[A-Za-z0-9]+Id$/) &&
        typeof json[k] === "string"
      ) {
        result[k] = mask(result[k], "nodeId")
      } else if (k === "email" && typeof json[k] === "string") {
        result[k] = mask(result[k], "email")
      } else if (k === "username" && typeof json[k] === "string") {
        result[k] = mask(result[k], "username")
      } else if (randomColumns.includes(k)) {
        result[k] = mask(result[k], "random")
      } else {
        result[k] = sanitize(json[k])
      }
    }
    return result
  } else {
    return json
  }
}

// Contains the PostGraphile schema and rootPgPool
interface ICtx {
  rootPgPool: Pool
  redisClient: FastifyRedis
  workerUtils: WorkerUtils
  options: PostGraphileOptions<IncomingMessage, ServerResponse>
  schema: GraphQLSchema
}
let ctx: ICtx | null = null

export const setup = async () => {
  const rootPgPool = new Pool({
    connectionString: TEST_DATABASE_URL,
  })
  const redisClient = new Redis(
    process.env.TEST_REDIS_URL
  ) as unknown as FastifyRedis
  const workerUtils = await makeWorkerUtils({
    connectionString: TEST_DATABASE_URL,
  })
  const options = getPostGraphileOptions({
    rootPgPool,
    redisClient,
    workerUtils,
  })
  const schema = await createPostGraphileSchema(
    rootPgPool,
    "app_public",
    options
  )

  // Store the context
  ctx = {
    rootPgPool,
    redisClient,
    workerUtils,
    options,
    schema,
  }
}

export const teardown = async () => {
  try {
    if (!ctx) {
      return null
    }
    const { rootPgPool, redisClient, workerUtils } = ctx
    ctx = null
    rootPgPool.end()
    workerUtils.release()
    // Flush redis after tests have run
    await redisClient.flushdb()
    await redisClient.quit()
    return null
  } catch (e) {
    console.error(e)
    return null
  }
}

export const runGraphQLQuery = async (
  query: string | DocumentNode, // The GraphQL query string or DocumentNode
  variables: { [key: string]: any } | null, // The GraphQL variables
  reqOptions: { [key: string]: any } | null, // Any additional items to set on `req` (e.g. `{user: {id: 17}}`)
  checker: (
    result: ExecutionResult,
    context: {
      pgClient: PoolClient
      redisClient: Redis
      req: any
    }
  ) => void | ExecutionResult | Promise<void | ExecutionResult> = () => {}, // Place test assertions in this function
  rollback = true,
  takeSnapshot = true
) => {
  if (!ctx) throw new Error("No ctx!")
  const { schema, rootPgPool, options } = ctx
  const req = new MockReq({
    _fastifyRequest: {
      ip: "127.1.1.1",
      url: options.graphqlRoute || "/graphql",
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      logIn: () => null,
    },
    ...reqOptions,
  })
  const res: any = { req }
  req.res = res

  const {
    pgSettings: pgSettingsGenerator,
    additionalGraphQLContextFromRequest,
  } = options
  const pgSettings =
    (typeof pgSettingsGenerator === "function"
      ? await pgSettingsGenerator(req)
      : pgSettingsGenerator) || {}

  // Because we're connected as the database owner, we should manually switch to
  // the authenticator role
  if (!pgSettings.role) {
    pgSettings.role = process.env.DATABASE_AUTHENTICATOR
  }

  // Pass callback = false to have the result available from running this
  // function. Used by createRegistration test to first run the claimRegistrationToken
  // mutation and use its result in the actual test.
  const result = await withPostGraphileContext(
    {
      ...options,
      pgPool: rootPgPool,
      pgSettings,
      pgForceTransaction: true,
    },
    async (context) => {
      let checkResult
      const { pgClient } = context
      try {
        // This runs our GraphQL query, passing the replacement client
        const additionalContext = additionalGraphQLContextFromRequest
          ? await additionalGraphQLContextFromRequest(req, res)
          : null
        const { redisClient } = additionalContext
        const result = await graphql(
          schema,
          typeof query === "string" ? query : print(query),
          null,
          {
            ...context,
            ...additionalContext,
            __TESTING: true,
          },
          variables
        )
        // Expand errors
        if (result.errors) {
          if (options.handleErrors) {
            result.errors = options.handleErrors(
              result.errors,
              req._fastifyRequest,
              res
            )
          } else {
            // This does a similar transform that PostGraphile does to errors.
            // It's not the same. Sorry.
            result.errors = result.errors.map((rawErr) => {
              const e = Object.create(rawErr)
              Object.defineProperty(e, "originalError", {
                value: rawErr.originalError,
                enumerable: false,
              })

              if (e.originalError) {
                Object.keys(e.originalError).forEach((k) => {
                  try {
                    e[k] = e.originalError[k]
                  } catch (err) {
                    // Meh.
                  }
                })
              }
              return e
            })
          }
        }

        // This is were we call the `checker` so you can do your assertions.
        // Also note that we pass the `replacementPgClient` so that you can
        // query the data in the database from within the transaction before it
        // gets rolled back. RedisClient is also passed to run assertions against
        // redis.
        checkResult = await checker(result, {
          pgClient,
          redisClient,
          req: req._fastifyRequest,
        })

        // You don't have to keep this, I just like knowing when things change!
        if (takeSnapshot) {
          expect(sanitize(result)).toMatchSnapshot()
        }

        return checkResult == null ? result : checkResult
      } finally {
        if (rollback) {
          // Rollback the transaction so no changes are written to the DB - this
          // makes our tests fairly deterministic.
          await pgClient.query("rollback")
        }
      }
    }
  )
  return result
}

export function removePropFromObject(obj: any, prop: string | number) {
  const { [prop]: _, ...rest } = obj
  return { ...rest }
}

export function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((v) => camelizeKeys(v))
  } else if (obj != null && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [camelCase(key)]: camelizeKeys(obj[key]),
      }),
      {}
    )
  }
  return obj
}

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
