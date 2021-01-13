import { Express } from "express";
import helmet from "helmet";

const isDevOrTest =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

const commonPolicies = {
  contentSecurityPolicy: {
    // Default directives taken from:
    // https://github.com/helmetjs/helmet/blob/main/middlewares/content-security-policy/index.ts
    //
    // We want to run dev with as close of a CSP as possible to production
    // "upgrade-insecure-requests" does not work with dev.
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "block-all-mixed-content": [],
      "font-src": ["'self'", "https:", "data:"],
      "frame-ancestors": ["'self'"],
      "img-src": ["'self'", "data:"],
      "object-src": ["'none'"],
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "https:", "'unsafe-inline'"],
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
                "script-src": ["'self'", "'unsafe-eval'"],
                "connect-src": ["'self'"],
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
