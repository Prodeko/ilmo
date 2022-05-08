import fastifyStatic from "@fastify/static"
import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import path from "node:path"

const SharedStatic: FastifyPluginAsync = async (app) => {
  app.register(fastifyStatic, {
    root: path.join(__dirname, "../../uploads"),
    prefix: "/uploads/",
    maxAge: "30d",
    immutable: true,
    cacheControl: true,
  })
}

export default fp(SharedStatic)
