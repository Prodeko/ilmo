import { parse } from "url"

import { FastifyPluginAsync } from "fastify"
import fastifyNextjs from "fastify-nextjs"
import fp from "fastify-plugin"

import { handleSessionCookie } from "./installSession"

const { NODE_ENV } = process.env || {}
const isDev = NODE_ENV === "development"

/**
 * The order of execution in this plugin is very important. For example,
 * reply.generateCsrf() must be called before handleSessionCookie, which must
 * be called before fastify.next, since under the hood that function copies
 * the headers from reply to reply.raw. reply.generateCsrf() must be called
 * before handleSessionCookie because it sets the csrf token into request.session.
 * Then handleSessionCookie (which is adapted from fastify-secure-session internal code)
 * sets the Set-Cookie header and fastify.next (which calls code from fastify-nextjs)
 * copies the headers from reply to reply.raw which is then sent off to the client.
 * A CSRF token which changes every request is sent to the client that must be
 * included in the CSRF-Token header when using POST (mainly to /graphql).
 */
const SSR: FastifyPluginAsync = async (fastify) => {
  let handler: any
  let csrfToken: string

  fastify.addHook("onRequest", async (request, reply) => {
    csrfToken = await reply.generateCsrf()
    handleSessionCookie(fastify, request, reply)
  })

  fastify
    .register(fastifyNextjs, {
      underPressure: isDev
        ? false
        : {
            maxEventLoopDelay: 2000,
            maxHeapUsedBytes: 0,
            maxRssBytes: 0,
            maxEventLoopUtilization: 0.98,
            message: "Ilmo is under too much load. Please try again later.",
            exposeStatusRoute: true,
            retryAfter: 30,
          },
      dev: isDev,
      dir: `${__dirname}/../../../client`,
    })
    .after(() => {
      fastify.next("/*", async (app, req, reply) => {
        const parsedUrl = parse(req.url, true)

        const query = {
          ...parsedUrl.query,
          CSRF_TOKEN: csrfToken,
          // See 'next.config.js'
          ROOT_URL: process.env.ROOT_URL || "http://localhost:5678",
          T_AND_C_URL: process.env.T_AND_C_URL,
        }

        if (!handler) {
          // TODO: should be able to use app.render that gets
          // defined in fastify.nextjs but that resulted in
          // 404 for all client routes. So we cache the handler
          // like this instead.
          handler = app.getRequestHandler()
        }

        await handler(req.raw, reply.raw, { ...parsedUrl, query })
        reply.sent = true
      })
    })
}

export default fp(SSR)
