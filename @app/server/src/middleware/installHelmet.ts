import { Express } from "express";
import helmet from "helmet";

const isDevOrTest =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

// Postgraphile v4.11.0 had some changes relating to
// websockets and defining referrer-policy is now required.
export default function installHelmet(app: Express) {
  app.use(
    helmet({
      referrerPolicy: { policy: "same-origin" },
      contentSecurityPolicy: isDevOrTest
        ? false
        : {
            directives: {
              ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            },
          },
    })
  );
}
