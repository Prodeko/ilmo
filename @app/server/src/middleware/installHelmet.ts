import { FastifyPluginAsync } from "fastify";
import helmet from "fastify-helmet";
import fp from "fastify-plugin";
import defaultHelmet from "helmet";

const tmpRootUrl = process.env.ROOT_URL;

if (!tmpRootUrl || typeof tmpRootUrl !== "string") {
  throw new Error("Envvar ROOT_URL is required.");
}
const ROOT_URL = tmpRootUrl;

const { NODE_ENV } = process.env;
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test";
const sentryReportUri = `https://sentry.prodeko.org/api/6/security/?sentry_key=711cf89fb3524b359f171aa9e07b3b3d&sentry_environment=${NODE_ENV}`;

const Helmet: FastifyPluginAsync = async (app) => {
  app.register(helmet, {
    contentSecurityPolicy: isDevOrTest
      ? false
      : {
          directives: {
            ...defaultHelmet.contentSecurityPolicy.getDefaultDirectives(),
            "connect-src": [
              "'self'",
              ROOT_URL.replace(/^http/, "ws"),
              "https://sentry.prodeko.org",
            ],
            // Event creation page needs blob:
            "img-src": [
              "'self'",
              "data:",
              "blob:",
              "https://static.prodeko.org",
            ],
            "style-src": ["'self'", "'unsafe-inline'"],
            "report-uri": [sentryReportUri],
          },
        },
  });
};

export default fp(Helmet);
