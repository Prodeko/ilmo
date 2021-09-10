import { FastifyPluginAsync } from "fastify"
import helmet from "fastify-helmet"
import fp from "fastify-plugin"
import defaultHelmet from "helmet"

const tmpRootUrl = process.env.ROOT_URL

if (!tmpRootUrl || typeof tmpRootUrl !== "string") {
  throw new Error("Envvar ROOT_URL is required.")
}
const ROOT_URL = tmpRootUrl

const { SENTRY_REPORT_URI, NODE_ENV } = process.env
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test"
const sentryReportUri = `${SENTRY_REPORT_URI}&sentry_environment=${NODE_ENV}`

const Helmet: FastifyPluginAsync = async (app) => {
  app.register(helmet, {
    // We use referer information in dev to allow bypassing persisted operations
    // (query allowlist). See installPostgraphile.ts and allowUnpersistedOperation
    // option.
    referrerPolicy: {
      policy: isDevOrTest ? "strict-origin-when-cross-origin" : "no-referrer",
    },
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
            "style-src": [
              "'self'",
              "'unsafe-inline'",
              "https://fonts.googleapis.com",
            ],
            "script-src": ["'self'", "https://usage.prodeko.org"],
            "frame-src": ["'self'", "https://usage.prodeko.org"],
            "report-uri": SENTRY_REPORT_URI ? [sentryReportUri] : [],
          },
        },
  })
}

export default fp(Helmet)
