import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import nextFactory from "next"
import path from "node:path"

const SSR: FastifyPluginAsync = async (fastify) => {
  const dev = process.env.NODE_ENV !== "production"
  const dir = path.resolve(__dirname, "../../../client")
  const nextApp = nextFactory({ dev, dir, customServer: true })
  const handle = nextApp.getRequestHandler()

  await nextApp.prepare()

  fastify.addHook("onClose", async () => {
    await nextApp.close()
  })

  fastify.all("/*", async (req, reply) => {
    // Headers staged by earlier hooks (CSRF token, session cookie) live on
    // the FastifyReply and are normally flushed by reply.send(). Since
    // Next.js writes directly to reply.raw, copy them across before handing
    // off so Set-Cookie etc. survive.
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        Array.isArray(value)
      ) {
        reply.raw.setHeader(name, value)
      }
    }
    await handle(req.raw, reply.raw)
    reply.hijack()
  })
}

export default fp(SSR)
