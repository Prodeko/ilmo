import { parse } from "url";

import { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import Next from "next";
import { HttpRequestHandler } from "postgraphile";

declare module "http" {
  export interface IncomingMessage {
    postgraphileMiddleware: HttpRequestHandler<IncomingMessage, ServerResponse>;
  }
}

if (!process.env.NODE_ENV) {
  throw new Error("No NODE_ENV envvar! Try `export NODE_ENV=development`");
}

const isDev = process.env.NODE_ENV === "development";

const SSR: FastifyPluginCallback = (fastify, _options, next) => {
  const nextApp = Next({
    dev: isDev,
    dir: `${__dirname}/../../../client/src`,
    quiet: !isDev,
    // Don't specify 'conf' key
  });
  const handle = nextApp.getRequestHandler();

  nextApp
    .prepare()
    .then(() => {
      fastify.all("/*", async (req, reply) => {
        const parsedUrl = parse(req.url, true);
        await handle(req.raw, reply.raw, {
          ...parsedUrl,
          query: {
            ...parsedUrl.query,
            // @ts-ignore
            CSRF_TOKEN: req.raw.csrfToken(),
            // See 'next.config.js'
            ROOT_URL: process.env.ROOT_URL || "http://localhost:5678",
            T_AND_C_URL: process.env.T_AND_C_URL,
            SENTRY_DSN: process.env.SENTRY_DSN,
          },
        });
        reply.sent = true;
      });

      next();
    })
    .catch((err) => next(err));
};

export default fp(SSR);
