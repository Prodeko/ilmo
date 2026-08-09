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

  // Force-logout entry point for clients that cannot trust the `logout`
  // mutation to have cleared their session.
  app.get("/logout", async (req, res) => {
    try {
      await req.logout()
    } catch (e) {
      req.log.error({ err: e }, "force logout failed to clear the session")
    }
    return res.redirect("/")
  })
}

export default fp(Passport)
