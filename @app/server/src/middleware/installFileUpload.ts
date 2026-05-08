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
  // fastify v5 requires content type to be a full string or RegExp; the bare
  // "multipart" string accepted by v4 is no longer valid. Match every
  // multipart/* subtype so multipart/form-data, multipart/mixed, etc. all
  // route through here.
  app.addContentTypeParser(
    /^multipart\//,
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
