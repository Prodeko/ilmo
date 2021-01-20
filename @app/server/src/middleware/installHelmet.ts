import { Express } from "express";
import helmet from "helmet";

const { NODE_ENV } = process.env;
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test";
const sentryReportUri = `https://sentry.prodeko.org/api/6/security/?sentry_key=711cf89fb3524b359f171aa9e07b3b3d&sentry_environment=${NODE_ENV}`;

const commonPolicies = {
  expectCt: {
    reportUri: sentryReportUri,
  },
  contentSecurityPolicy: {
    // Default directives taken from:
    // https://github.com/helmetjs/helmet/blob/main/middlewares/content-security-policy/index.ts
    //
    // We want to run dev with as close of a CSP as possible to production
    // "upgrade-insecure-requests" does not work with dev.
    directives: {
      "default-src": ["'self'"],
      "connect-src": ["'self'", "https://sentry.prodeko.org"],
      "base-uri": ["'self'"],
      "block-all-mixed-content": [],
      "font-src": ["'self'", "https:", "data:"],
      "frame-ancestors": ["'self'"],
      "img-src": ["'self'", "data:"],
      "object-src": ["'none'"],
      "script-src": ["'self'", "'unsafe-inline'", "https://sentry.prodeko.org"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "https:", "'unsafe-inline'"],
      "report-uri": [sentryReportUri],
    },
  },
  // Postgraphile v4.11.0 had some changes related to
  // websockets and defining a referrer-policy is now required.
  referrerPolicy: { policy: "same-origin" },
};

export default function installHelmet(app: Express) {
  app.use(
    helmet(
      isDevOrTest
        ? {
            ...commonPolicies,
            contentSecurityPolicy: {
              directives: {
                ...commonPolicies.contentSecurityPolicy.directives,
                // Dev needs 'unsafe-eval' due to
                // https://github.com/vercel/next.js/issues/14221
                "script-src": [
                  "'self'",
                  "'unsafe-eval'",
                  "https://sentry.prodeko.org",
                ],
              },
            },
          }
        : {
            ...commonPolicies,
            contentSecurityPolicy: {
              directives: {
                ...commonPolicies.contentSecurityPolicy.directives,
                "upgrade-insecure-requests": [],
              },
            },
          }
    )
  );
}
