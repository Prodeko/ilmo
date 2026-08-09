import fastifyPassport from "@fastify/passport"
import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

import { buildKeycloakLogoutUrl } from "./installKeycloak"

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
  // mutation to have cleared their session. It ends the Keycloak session too
  // when there is one: /login bounces straight back to Keycloak, so a
  // surviving IdP session would sign the next visitor on this browser right
  // back in as this user.
  app.get("/logout", async (req, res) => {
    let redirectTo: string | null = null
    try {
      const sessionId = req.user?.sessionId
      if (sessionId) {
        const {
          rows: [row],
        } = await app.rootPgPool.query(
          "select user_id from app_private.sessions where uuid = $1",
          [sessionId]
        )
        if (row?.user_id) {
          redirectTo = await buildKeycloakLogoutUrl(
            app.rootPgPool,
            row.user_id,
            req.log
          )
        }
      }
    } catch (e) {
      // The local logout below must run no matter what happened here.
      req.log.error(
        { err: e },
        "force logout: keycloak end-session url could not be resolved"
      )
    }
    try {
      await req.logout()
    } catch (e) {
      req.log.error({ err: e }, "force logout failed to clear the session")
    }
    return res.redirect(redirectTo ?? "/")
  })
}

export default fp(Passport)
