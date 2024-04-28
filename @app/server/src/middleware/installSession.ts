import { CookieSerializeOptions } from "@fastify/cookie"
import fastifySecureSession from "@fastify/secure-session"
import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

const { SECRET, NODE_ENV } = process.env
if (!SECRET) {
  throw new Error("Server misconfigured")
}
const isProd = NODE_ENV === "production"

export const cookieOptions: CookieSerializeOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: isProd ? true : false,
  signed: true,
}

const Session: FastifyPluginAsync = async (app) => {
  app.register(fastifySecureSession, {
    key: Buffer.from(SECRET, "hex"),
    expiry: 24 * 60 * 60, // 24 hours
    cookie: cookieOptions,
  })
}

export default fp(Session)
