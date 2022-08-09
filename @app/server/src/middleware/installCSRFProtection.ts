import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import fastifyCSRF from "@fastify/csrf-protection"
import fp from "fastify-plugin"

import {
  cookieOptions as sessionCookieOptions,
  handleSessionCookie,
} from "./installSession"

const { ROOT_URL, NODE_ENV } = process.env
const isDev = NODE_ENV === "development"

// Set httpOnly to false to allow reading the csrf token with
// document.cookie on the client side
const cookieOptions = { ...sessionCookieOptions, httpOnly: false }

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
async function handleCsrfToken(request: FastifyRequest, reply: FastifyReply) {
  const sessionHasCsrfToken = !!request?.session.get("_csrf")
  const requestHasCsrfToken =
    !!request.cookies.csrfToken || !!request.headers["csrf-token"]
  if (
    (!sessionHasCsrfToken || !requestHasCsrfToken) &&
    request.method === "GET"
  ) {
    // Generate a new CSRF token if one does not yet exist in the session
    // or if the request did not contain a token and the request method is GET
    const csrfToken = await reply.generateCsrf(cookieOptions)
    reply.setCookie("csrfToken", csrfToken, cookieOptions)
  }
}

const CSRFProtection: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCSRF, {
    sessionPlugin: "@fastify/secure-session",
  })

  app.addHook("onRequest", async (request, reply) => {
    await handleCsrfToken(request, reply)
    handleSessionCookie(app, request, reply)
  })

  app.addHook("onRequest", (request, reply, done) => {
    if (
      isDev &&
      request.method === "POST" &&
      request.url === "/graphql" &&
      request.headers.referer === `${ROOT_URL}/graphiql`
    ) {
      // Bypass CSRF for GraphiQL in dev
      done()
    } else if (request.method === "POST") {
      // Add CSRF protection to POST requests
      app.csrfProtection(request, reply, done)
    } else {
      done()
    }
  })
}

export default fp(CSRFProtection)
