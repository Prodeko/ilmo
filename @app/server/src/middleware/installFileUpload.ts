import { FastifyPluginAsync, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import { processRequest } from "graphql-upload"

declare module "fastify" {
  interface FastifyRequest {
    /**
     * True if the request is a multipart request
     */
    isMultipart?: boolean
  }
}

const FileUpload: FastifyPluginAsync = async (app, options = {}) => {
  app.addContentTypeParser(
    "multipart",
    async (request: FastifyRequest, _payload: {}) => {
      request.isMultipart = true
    }
  )

  app.addHook("preValidation", async (request, reply) => {
    if (!request.isMultipart) {
      return
    }

    request.body = await processRequest(request.raw, reply.raw, options)
  })
}

export default fp(FileUpload)
