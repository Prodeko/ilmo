import fastifyPassport from "@fastify/passport"
import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

declare module "fastify" {
  interface PassportUser {
    sessionId: string
  }
}

const Passport: FastifyPluginAsync = async (app) => {
  fastifyPassport.registerUserSerializer<{ sessionId: string }, string>(
    async (user) => user?.sessionId
  )

  fastifyPassport.registerUserDeserializer(async (id, _request) => {
    return { sessionId: id }
  })

  app.register(fastifyPassport.initialize())
  app.register(fastifyPassport.secureSession())

  app.get("/logout", (req, res) => {
    req.logout()
    res.redirect("/")
  })
}

export default fp(Passport)
