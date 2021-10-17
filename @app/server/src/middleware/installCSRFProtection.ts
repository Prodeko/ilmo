import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify"
import fastifyCSRF from "fastify-csrf"
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

async function handleCsrfToken(request: FastifyRequest, reply: FastifyReply) {
  const sessionHasCsrfToken = !!request?.session.get("_csrf")
  const requestHasCsrfToken = !!request.cookies.csrfToken
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
    sessionPlugin: "fastify-secure-session",
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
