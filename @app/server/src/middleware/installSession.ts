import { SerializeOptions } from "@fastify/cookie"
import fastifySecureSession from "@fastify/secure-session"
import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify"
import fp from "fastify-plugin"

const { SECRET, NODE_ENV } = process.env
if (!SECRET) {
  throw new Error("Server misconfigured")
}
const isProd = NODE_ENV === "production"

// Typed as SerializeOptions (the narrow `cookie` package shape) rather than
// fastify's CookieSerializeOptions because serializeCookie() takes the
// narrow one. SerializeOptions is also assignable to CookieSerializeOptions
// (no `secure: "auto"` here, no `signed`), so secure-session's register
// cookie option still accepts it.
export const cookieOptions: SerializeOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: isProd ? true : false,
}

export function handleSessionCookie(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  /**
   * The SSR routes hand the response off to Next.js via reply.hijack(),
   * which skips fastify's onSend hooks. @fastify/cookie@11 stages
   * reply.setCookie() calls and only flushes them in its onSend hook, so
   * those staged cookies never reach the wire on hijacked requests. To
   * keep the session and CSRF cookies working across both the hijacked
   * SSR path and the normal /graphql path, we serialize the cookie here
   * and append it directly to reply.raw — that survives hijack and is
   * additive with anything @fastify/cookie writes for non-hijacked routes.
   *
   * The cookie is read on the client in @app/lib/withUrql.ts and used to
   * protect against CSRF via the Double Submit Cookie pattern:
   * https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie
   */

  if (!request.isSameOrigin) {
    /**
     * For security reasons we only enable sessions for requests within our
     * own website; external URLs that need to issue requests to us must use a
     * different authentication method such as bearer tokens.
     */
    return
  }

  const session = request.session

  if (!session || !session.changed) {
    return
  }

  const cookieValue = session.deleted
    ? ""
    : fastify.encodeSecureSession(session)
  const opts = session.deleted
    ? { ...cookieOptions, expires: new Date(0), maxAge: 0 }
    : cookieOptions

  reply.raw.appendHeader(
    "Set-Cookie",
    fastify.serializeCookie("session", cookieValue, opts)
  )
}

const Session: FastifyPluginAsync = async (app) => {
  app.register(fastifySecureSession, {
    key: Buffer.from(SECRET, "hex"),
    cookie: cookieOptions,
  })
}

export default fp(Session)
