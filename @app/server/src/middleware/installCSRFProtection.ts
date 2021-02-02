import csrf from "csurf";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

declare module "http" {
  interface IncomingMessage {
    /**
     * True if either the request 'Origin' header matches our ROOT_URL, or if
     * there was no 'Origin' header (in which case we must give the benefit of
     * the doubt; for example for normal resource GETs).
     */
    csrfToken: () => string;
  }
}

const CSRFProtection: FastifyPluginAsync = async (app) => {
  const csrfProtection = csrf({
    // Store to the session rather than a Cookie
    cookie: false,

    // Extract the CSRF Token from the `CSRF-Token` header.
    value(req) {
      const csrfToken = req.headers["csrf-token"];
      return typeof csrfToken === "string" ? csrfToken : "";
    },
  });

  app.use((req, res, next) => {
    if (
      req.method === "POST" &&
      req.path === "/graphql" &&
      (req.headers.referer === `${process.env.ROOT_URL}/graphiql` ||
        req.headers.origin === process.env.ROOT_URL)
    ) {
      // Bypass CSRF for GraphiQL
      next();
    } else {
      csrfProtection(req, res, next);
    }
  });
};

export default fp(CSRFProtection);
