import { FastifyPluginAsync } from "fastify";
import helmet from "fastify-helmet";
import fp from "fastify-plugin";
import defaultHelmet from "helmet";

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
              "wss://ilmo3.prodeko.org",
              "https://sentry.prodeko.org",
            ],
            "report-uri": [sentryReportUri],
          },
        },
  });
};

export default fp(Helmet);
