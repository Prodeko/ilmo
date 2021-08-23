import { parse } from "url"

import * as Sentry from "@sentry/node"
import { FastifyPluginCallback } from "fastify"
import fp from "fastify-plugin"
import Next from "next"

import { handleSessionCookie } from "./installSession"

if (!process.env.NODE_ENV) {
  throw new Error("No NODE_ENV envvar! Try `export NODE_ENV=development`")
}

const isDev = process.env.NODE_ENV === "development"

const SSR: FastifyPluginCallback = (fastify, _options, next) => {
  const nextApp = Next({
    dev: isDev,
    dir: `${__dirname}/../../../client`,
    // Don't specify 'conf' key
  })
  const handle = nextApp.getRequestHandler()

  nextApp
    .prepare()
    .then(() => {
      fastify.get("/*", async (req, reply) => {
        const parsedUrl = parse(req.url, true)
        const csrfToken = await reply.generateCsrf()

        handleSessionCookie(fastify, req, reply)

        for (const [headerName, headerValue] of Object.entries(
          reply.getHeaders()
        )) {
          reply.raw.setHeader(headerName, headerValue!)
        }

        await handle(req.raw, reply.raw, {
          ...parsedUrl,
          query: {
            ...parsedUrl.query,
            CSRF_TOKEN: csrfToken,
            // See 'next.config.js'
            ROOT_URL: process.env.ROOT_URL || "http://localhost:5678",
            T_AND_C_URL: process.env.T_AND_C_URL,
            SENTRY_DSN: process.env.SENTRY_DSN,
            ENABLE_REGISTRATION: process.env.ENABLE_REGISTRATION,
          },
        })

        reply.sent = true
      })

      fastify.setNotFoundHandler(async (request, reply) => {
        await nextApp.render404(request.raw, reply.raw)
        reply.sent = true
      })

      next()
    })
    .catch((err) => {
      Sentry.captureException(err)
      return next(err)
    })
}

export default fp(SSR)
