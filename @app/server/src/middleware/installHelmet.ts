import { Express } from "express";
import helmet from "helmet";

const { NODE_ENV } = process.env;
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test";
const sentryReportUri = `https://sentry.prodeko.org/api/6/security/?sentry_key=711cf89fb3524b359f171aa9e07b3b3d&sentry_environment=${NODE_ENV}`;

export default function installHelmet(app: Express) {
  app.use(
    helmet({
      contentSecurityPolicy: isDevOrTest
        ? false
        : {
            directives: {
              ...helmet.contentSecurityPolicy.getDefaultDirectives(),
              "connect-src": [
                "'self'",
                "wss://ilmo3.prodeko.org",
                "https://sentry.prodeko.org",
              ],
              "report-uri": [sentryReportUri],
            },
          },
    })
  );
}
