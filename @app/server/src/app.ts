import { Server } from "http";

import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import { Application, Request, Response, Router } from "express";
import Fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerFactory,
} from "fastify";
import fastifyExpress from "fastify-express";
import {
  Middleware,
  PostGraphileResponse,
  PostGraphileResponseFastify3,
} from "postgraphile";

import * as middleware from "./middleware";
import { makeShutdownActions, ShutdownAction } from "./shutdownActions";
import { sanitizeEnv } from "./utils";

declare module "fastify" {
  export interface FastifyInstance {
    express: Application;
    httpServer: Server;
    shutdownActions: ShutdownAction[];
    websocketMiddlewares: Middleware<Request, Response>[];
  }
}

/**
 * Converts a PostGraphile route handler into a Fastify request handler.
 */
export const convertHandler = (
  handler: (res: PostGraphileResponse) => Promise<void>
) => (request: FastifyRequest, reply: FastifyReply) =>
  handler(new PostGraphileResponseFastify3(request, reply));

function initSentry() {
  Sentry.init({
    environment: process.env.NODE_ENV,
    dsn: process.env.SENTRY_DSN,
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // enable database query tracing
      new Tracing.Integrations.Postgres(),
    ],

    // We recommend adjusting this value in production, or using tracesSampler
    // for finer control
    tracesSampleRate: 0.3,
  });
}

export async function makeApp({
  serverFactory,
}: {
  serverFactory?: FastifyServerFactory;
} = {}): Promise<FastifyInstance> {
  sanitizeEnv();

  const isTest = process.env.NODE_ENV === "test";
  const isDev = process.env.NODE_ENV === "development";

  const shutdownActions = makeShutdownActions();

  if (isDev) {
    shutdownActions.push(() => {
      require("inspector").close();
    });
  }

  /*
   * Our FastifyInstance server
   */
  const app = Fastify({
    pluginTimeout: isDev ? 30000 : 10000,
    logger: false,
    serverFactory,
  });
  initSentry();

  /**
   * Register Fastify Express compatability plugin.
   * This plugin allows us to use express style middleware with Fastify.
   * The plugin enables us to use sessions with websocket connections
   * and to install express style middlewares.
   *
   * This compatability layer with is used with the following middlewares:
   * installSession, installSameOrigin, installCSRFProtection, installPassport
   * and installPassportStrategy.
   *
   * See: https://github.com/graphile/postgraphile/blob/ba9a7bcf1c3fa3347cf07de0a3732cfd0d5b6dcb/src/postgraphile/http/subscriptions.ts#L109
   */
  await app.register(fastifyExpress);
  app.use(Router());

  /*
   * Getting access to the HTTP server directly means that we can do things
   * with websockets if we need to (e.g. GraphQL subscriptions).
   */
  app.decorate("httpServer", app.server);

  /*
   * For a clean nodemon shutdown, we need to close all our sockets otherwise
   * we might not come up cleanly again (inside nodemon).
   */
  app.decorate("shutdownActions", shutdownActions);

  /*
   * When we're using websockets, we may want them to have access to
   * sessions/etc for authentication.
   */
  const websocketMiddlewares: Middleware<Request, Response>[] = [];
  app.decorate("websocketMiddlewares", websocketMiddlewares);

  /*
   * Middleware is installed from the /server/middleware directory. These
   * helpers may augment the FastifyInstance app with new settings and/or install
   * FastifyInstance middleware. These helpers may be asynchronous, but they should
   * operate very rapidly to enable quick as possible server startup.
   */
  await app.register(middleware.installSentryRequestHandler);
  await app.register(middleware.installDatabasePools);
  await app.register(middleware.installRedis);
  await app.register(middleware.installWorkerUtils);
  await app.register(middleware.installHelmet);
  await app.register(middleware.installSameOrigin);
  await app.register(middleware.installSession);
  await app.register(middleware.installCSRFProtection);
  await app.register(middleware.installPassport);
  await app.register(middleware.installStaticUploads);
  if (isTest || isDev) {
    await app.register(middleware.installCypressServerCommand);
  }
  await app.register(middleware.installPostGraphile);
  await app.register(middleware.installSSR);
  await app.register(middleware.installFileUpload);

  /*
   * Error handling middleware
   */
  app.register(middleware.installErrorHandler);

  return app;
}
