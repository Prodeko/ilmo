import { RequestHandler } from "express";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

declare module "http" {
  interface IncomingMessage {
    /**
     * True if either the request 'Origin' header matches our ROOT_URL, or if
     * there was no 'Origin' header (in which case we must give the benefit of
     * the doubt; for example for normal resource GETs).
     */
    isSameOrigin?: boolean;
  }
}

const SameOrigin: FastifyPluginAsync = async (app) => {
  const middleware: RequestHandler = (req, _res, next) => {
    req.isSameOrigin =
      !req.headers.origin || req.headers.origin === process.env.ROOT_URL;
    next();
  };
  app.use(middleware);
  app.websocketMiddlewares.push(middleware);
};

export default fp(SameOrigin);
