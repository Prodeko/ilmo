import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify"
import { CookieSerializeOptions } from "fastify-cookie"
import fp from "fastify-plugin"
import fastifySecureSession from "fastify-secure-session"

const MILLISECOND = 1
const SECOND = 1000 * MILLISECOND
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const { SECRET } = process.env
if (!SECRET) {
  throw new Error("Server misconfigured")
}
const MAXIMUM_SESSION_DURATION_IN_MILLISECONDS = 3 * DAY

const cookieOptions: CookieSerializeOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: MAXIMUM_SESSION_DURATION_IN_MILLISECONDS,
}

export function handleSessionCookie(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  /**
   * Adapted from https://github.com/fastify/fastify-secure-session/blob/master/index.js#L154.
   *
   * We need to manually handle the session cookie since because we don't reply to SSR
   * requests through the normal Fastify request-reply cycle. Instead, we use a handler
   * provided by nextApp.getRequestHandler() (defined in installSSR.ts) and then indicate
   * that a reply has been sent by setting reply.sent = true. This means that additional
   * hooks such as 'onSend' will not be invoked (https://www.fastify.io/docs/v1.13.x/Reply/#sent).
   * Thus we have to manually set the session cookie in the response. Normally, the cookie would be
   * set in the onSend hook of fastify-secure-session (https://github.com/fastify/fastify-secure-session/blob/master/index.js#L153).
   * The cookie will be read in @app/lib/withUrql.ts and used to protect against CSRF attacks using the Double Submit Cookie pattern:
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
      reply.setCookie("session", "", cookieOptions)
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
