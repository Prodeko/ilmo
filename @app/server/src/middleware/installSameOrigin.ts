import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

declare module "fastify" {
  interface FastifyRequest {
    /**
     * True if either the request 'Origin' header matches our ROOT_URL, or if
     * there was no 'Origin' header (in which case we must give the benefit of
     * the doubt; for example for normal resource GETs).
     */
    isSameOrigin?: boolean
  }
}

const SameOrigin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request, _reply) => {
    const origin = request.headers.origin
    request.isSameOrigin = !origin || origin === process.env.ROOT_URL
  })
}

export default fp(SameOrigin)
