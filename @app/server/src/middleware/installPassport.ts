import { FastifyPluginAsync } from "fastify"
import fastifyPassport from "fastify-passport"
import fp from "fastify-plugin"
import got from "got"
import { Strategy as Oauth2Strategy } from "passport-oauth2"

import installPassportStrategy from "./installPassportStrategy"

const { NODE_ENV } = process.env
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test"

interface ProdekoUser {
  pk: string
  email: string
  first_name: string
  last_name: string
  has_accepted_policies: boolean
  is_staff: boolean
  is_superuser: boolean
}

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

  if (process.env.PRODEKO_OAUTH_KEY) {
    installPassportStrategy(
      app,
      app.rootPgPool,
      "oauth2",
      // @ts-ignore
      Oauth2Strategy,
      {
        clientID: process.env.PRODEKO_OAUTH_KEY,
        clientSecret: process.env.PRODEKO_OAUTH_SECRET,
        authorizationURL: `${process.env.PRODEKO_OAUTH_ROOT_URL}/oauth2/auth`,
        tokenURL: `${process.env.PRODEKO_OAUTH_ROOT_URL}/oauth2/token`,
      },
      {},
      async (_empty, accessToken, _refreshToken, _extra, _req) => {
        const headers = {
          Authorization: `Bearer ${accessToken}`,
        }

        // Get user details
        const userResponse = await got<ProdekoUser>(
          `${process.env.PRODEKO_OAUTH_ROOT_URL}/oauth2/user_details/`,
          {
            method: "GET",
            headers,
            responseType: "json",
            https: {
              rejectUnauthorized: !isDevOrTest,
            },
          }
        )

        const { pk, email, first_name, last_name, has_accepted_policies } =
          userResponse.body

        if (!has_accepted_policies) {
          const e = new Error(
            `You have not accepted Prodeko's privacy policy.
Please accept our privacy policy in order to use the site while logged in.
You may accept the policy by logging in via https://prodeko.org/login,
and clicking 'I agree' on the displayed prompt.`.replace(/\n/g, " ")
          )
          e["code"] = "PRPOL"
          throw e
        }

        // Use email as username since that is the
        // unique field in prodeko.org authentication
        return {
          id: pk,
          displayName: `${first_name} ${last_name}`,
          username: email,
          avatarUrl:
            "https://static.prodeko.org/media/public/2020/07/07/anonymous_prodeko.jpg",
          email: email,
        }
      },
      ["token", "tokenSecret"]
    )
  }

  app.get("/logout", (req, res) => {
    req.logout()
    res.redirect("/")
  })
}

export default fp(Passport)
