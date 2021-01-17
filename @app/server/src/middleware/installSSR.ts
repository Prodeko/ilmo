import { parse } from "url";

import { Express } from "express";
import next from "next";

if (!process.env.NODE_ENV) {
  throw new Error("No NODE_ENV envvar! Try `export NODE_ENV=development`");
}

const isDev = process.env.NODE_ENV === "development";

export default async function installSSR(app: Express) {
  const nextApp = next({
    dev: isDev,
    dir: `${__dirname}/../../../client/src`,
    quiet: !isDev,
    // Don't specify 'conf' key
  });

  const handlerPromise = (async () => {
    await nextApp.prepare();
    return nextApp.getRequestHandler();
  })();

  handlerPromise.catch((e) => {
    console.error("Error occurred starting Next.js; aborting process");
    console.error(e);
    process.exit(1);
  });

  app.get("*", async (req, res) => {
    const handler = await handlerPromise;
    const parsedUrl = parse(req.url, true);
    handler(req, res, {
      ...parsedUrl,
      query: {
        ...parsedUrl.query,
        CSRF_TOKEN: req.csrfToken(),
        // See 'next.config.js':
        ROOT_URL: process.env.ROOT_URL || "http://localhost:5678",
        T_AND_C_URL: process.env.T_AND_C_URL,
        SENTRY_DSN: process.env.SENTRY_DSN,
      },
    });
  });
}
