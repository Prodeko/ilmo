import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

const Health: FastifyPluginAsync = async (app) => {
  app.get("/healthz", async (_req, reply) => {
    reply.type("text/plain").send("ok")
  })
}

export default fp(Health)
