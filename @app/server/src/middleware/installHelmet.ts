import { Express } from "express";
import helmet from "helmet";

const isDev = process.env.NODE_ENV === "development";

export default function installHelmet(app: Express) {
  app.use(
    helmet({
      contentSecurityPolicy: isDev
        ? false
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "prodeko.org", "google.com"],
              objectSrc: ["'none'"],
            },
          },
    })
  );
}
