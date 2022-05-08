import path from "path"
import { parse } from "url"

import fastifyNextjs from "@fastify/nextjs"
import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

const isDev = process.env.NODE_ENV === "development"

/**
 * The order of execution in this plugin is very important. For example,
 * reply.generateCsrf() must be called before handleSessionCookie, which must
 * be called before fastify.next, since under the hood that function copies
 * the headers from reply to reply.raw. reply.generateCsrf() must be called
 * before handleSessionCookie because it sets the csrf token into request.session.
 * Then handleSessionCookie (which is adapted from @fastify/secure-session internal code)
 * sets the Set-Cookie header and fastify.next (which calls code from @fastify/nextjs)
 * copies the headers from reply to reply.raw which is then sent off to the client.
 * A CSRF token which changes every request is sent to the client that must be
 * included in the CSRF-Token header when using POST (mainly to /graphql).
 */
const SSR: FastifyPluginAsync = async (fastify) => {
  console.log(path.resolve(`${__dirname}/../../../client`))
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
      customServer: true,
      dir: path.resolve(`${__dirname}/../../../client`),
    })
    .after(() => {
      fastify.next("/*", async (app, req, reply) => {
        const parsedUrl = parse(req.url, true)
        await app.getRequestHandler()(req.raw, reply.raw, parsedUrl)
        reply.sent = true
      })
    })
}

export default fp(SSR)
