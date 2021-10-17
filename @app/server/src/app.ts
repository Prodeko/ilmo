import { Server } from "http"

import Fastify, {
  FastifyReply,
  FastifyRequest,
  FastifyServerFactory,
} from "fastify"
import {
  Middleware,
  PostGraphileResponse,
  PostGraphileResponseFastify3,
} from "postgraphile"

import * as middleware from "./middleware"
import { makeShutdownActions, ShutdownAction } from "./shutdownActions"
import { sanitizeEnv } from "./utils"

declare module "fastify" {
  export interface FastifyInstance {
    httpServer: Server
    shutdownActions: ShutdownAction[]
    websocketMiddlewares: Middleware[]
  }
}

/**
 * Converts a PostGraphile route handler into a Fastify request handler.
 */
export const convertHandler =
  (handler: (res: PostGraphileResponse) => Promise<void>) =>
  (request: FastifyRequest, reply: FastifyReply) =>
    handler(new PostGraphileResponseFastify3(request, reply))

export async function makeApp({
  serverFactory,
}: {
  serverFactory?: FastifyServerFactory
} = {}) {
  sanitizeEnv()

  const isTest = process.env.NODE_ENV === "test"
  const isDev = process.env.NODE_ENV === "development"

  const shutdownActions = makeShutdownActions()

  if (isDev) {
    shutdownActions.push(() => {
      require("inspector").close()
    })
  }

  /*
   * Our FastifyInstance server
   */
  const app = Fastify({
    pluginTimeout: isDev ? 60000 : 10000,
    logger: isDev ? false : { level: process.env.LOG_LEVEL },
    trustProxy: !isDev,
    serverFactory,
  })
  /*
   * Getting access to the HTTP server directly means that we can do things
   * with websockets if we need to (e.g. GraphQL subscriptions).
   */
  app.decorate("httpServer", app.server)

  /*
   * For a clean nodemon shutdown, we need to close all our sockets otherwise
   * we might not come up cleanly again (inside nodemon).
   */
  app.decorate("shutdownActions", shutdownActions)

  /*
   * When we're using websockets, we may want them to have access to
   * sessions/etc for authentication.
   */
  const websocketMiddlewares: Middleware[] = []
  app.decorate("websocketMiddlewares", websocketMiddlewares)

  /*
   * Middleware is installed from the /server/middleware directory. These
   * helpers may augment the FastifyInstance app with new settings and/or install
   * Fastify middleware. These helpers may be asynchronous, but they should
   * operate very rapidly to enable quick as possible server startup.
   */
  // Error handling middleware
  await app.register(middleware.installErrorHandler)

  await app.register(middleware.installDatabasePools)
  await app.register(middleware.installRedis)
  await app.register(middleware.installWorkerUtils)
  await app.register(middleware.installHelmet)
  await app.register(middleware.installSameOrigin)
  await app.register(middleware.installSession)
  await app.register(middleware.installCSRFProtection)
  await app.register(middleware.installPassport)
  await app.register(middleware.installStaticUploads)
  if (isTest || isDev) {
    await app.register(middleware.installCypressServerCommand)
  }
  await app.register(middleware.installPostGraphile)
  await app.register(middleware.installFileUpload)

  // Needs to be last
  await app.register(middleware.installSSR)

  return app
}
