import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify"
import { CookieSerializeOptions } from "fastify-cookie"
import fp from "fastify-plugin"
import fastifySecureSession from "fastify-secure-session"

const { SECRET } = process.env
if (!SECRET) {
  throw new Error("Server misconfigured")
}
export const cookieOptions: CookieSerializeOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: true,
}

export function handleSessionCookie(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  /**
   * Adapted from https://github.com/fastify/fastify-secure-session/blob/master/index.js#L154.
   *
   * We need to manually handle the session cookie because we don't reply to requests through
   * the normal Fastify request-reply cycle. Instead, we use a handler provided by nextApp.getRequestHandler()
   * (defined in installSSR.ts) and then indicate that a reply has been sent by setting reply.sent = true.
   * This means that additional hooks such as 'onSend' will not be invoked (https://www.fastify.io/docs/v1.13.x/Reply/#sent).
   * Specifically the hook from fastify-secure-session, which would use the Set-Cookie header to set a
   * session cookie in the reply is not run (https://github.com/fastify/fastify-secure-session/blob/master/index.js#L153)
   * Thus we have to manually set the session cookie in the response. The cookie will be read in
   * @app/lib/withUrql.ts and used to protect against CSRF attacks using the Double Submit Cookie pattern:
   * https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)
   */

  if (request.isSameOrigin) {
    /**
     * For security reasons we only enable sessions for requests within our
     * own website; external URLs that need to issue requests to us must use a
     * different authentication method such as bearer tokens.
     */
    const session = request.session

    if (!session || !session.changed) {
      return
    } else if (session.deleted) {
      reply.setCookie(
        "session",
        "",
        Object.assign({}, cookieOptions, { expires: new Date(0), maxAge: 0 })
      )
      return
    }

    reply.setCookie(
      "session",
      fastify.encodeSecureSession(session),
      Object.assign({}, cookieOptions)
    )
  }
}

const Session: FastifyPluginAsync = async (app) => {
  app.register(fastifySecureSession, {
    key: Buffer.from(SECRET, "hex"),
    cookie: cookieOptions,
  })
}

export default fp(Session)
