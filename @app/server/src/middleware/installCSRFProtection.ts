import { FastifyPluginAsync } from "fastify"
import fastifyCSRF from "fastify-csrf"
import fp from "fastify-plugin"

const { ROOT_URL } = process.env

const CSRFProtection: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCSRF, { sessionPlugin: "fastify-secure-session" })

  app.addHook("onRequest", (request, reply, done) => {
    if (
      request.method === "POST" &&
      request.url === "/graphql" &&
      request.headers.referer === `${ROOT_URL}/graphiql`
    ) {
      // Bypass CSRF for GraphiQL
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
