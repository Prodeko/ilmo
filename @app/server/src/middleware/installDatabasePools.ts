import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import { Pool } from "pg"

declare module "fastify" {
  export interface FastifyInstance {
    authPgPool: Pool
    rootPgPool: Pool
  }
}

/**
 * When a PoolClient omits an 'error' event that cannot be caught by a promise
 * chain (e.g. when the PostgreSQL server terminates the link but the client
 * isn't actively being used) the error is raised via the Pool. In Node.js if
 * an 'error' event is raised and it isn't handled, the entire process exits.
 * This NOOP handler avoids this occurring on our pools.
 *
 */
function swallowPoolError(_error: Error) {
  // NOOP
}

const DatabasePools: FastifyPluginAsync = async (app) => {
  // This pool runs as the database owner, so it can do anything.
  const rootPgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })
  rootPgPool.on("error", swallowPoolError)
  app.decorate("rootPgPool", rootPgPool)

  // This pool runs as the unprivileged user, it's what PostGraphile uses.
  const authPgPool = new Pool({
    connectionString: process.env.AUTH_DATABASE_URL,
  })
  authPgPool.on("error", swallowPoolError)
  app.decorate("authPgPool", authPgPool)

  const shutdownActions = app.shutdownActions
  shutdownActions.push(() => {
    rootPgPool.end()
  })
  shutdownActions.push(() => {
    authPgPool.end()
  })
}

export default fp(DatabasePools)
