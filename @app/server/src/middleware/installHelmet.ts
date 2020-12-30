import { Express } from "express";
import helmet from "helmet";

const isDev = process.env.NODE_ENV === "development";

// Postgraphile v4.11.0 had some changes related to websockets
// and Postgraphiql and referrer policy is required
const commonPolicies = { referrerPolicy: { policy: "same-origin" } };

export default function installHelmet(app: Express) {
  app.use(
    helmet(
      isDev
        ? {
            // Dev needs 'unsafe-eval' due to
            // https://github.com/vercel/next.js/issues/14221
            contentSecurityPolicy: {
              directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": ["'self'", "'unsafe-eval'"],
              },
            },
            ...commonPolicies,
          }
        : {
            ...commonPolicies,
          }
    )
  );
}
