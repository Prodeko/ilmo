#!/usr/bin/env node
/* eslint-disable no-console */
import { createServer } from "http";

import chalk from "chalk";
import { FastifyServerFactory } from "fastify";

import { makeApp } from "./app";

// @ts-ignore
const packageJson = require("../../../package.json");

const serverFactory: FastifyServerFactory = (handler, _opts) => {
  const server = createServer((req, res) => {
    handler(req, res);
  });
  return server;
};

async function main() {
  // Make our application (loading all the middleware, etc)
  const app = await makeApp({ serverFactory });

  // And finally, we open the listen port
  const PORT = parseInt(process.env.PORT || "", 10) || 3000;
  app.listen(PORT, () => {
    const address = app.server.address();
    const actualPort: string =
      typeof address === "string"
        ? address
        : address && address.port
        ? String(address.port)
        : String(PORT);
    console.log();
    console.log(
      chalk.green(
        `${chalk.bold(packageJson.name)} listening on port ${chalk.bold(
          actualPort
        )}`
      )
    );
    console.log();
    console.log(
      `  Site:     ${chalk.bold.underline(`http://localhost:${actualPort}`)}`
    );
    console.log(
      `  GraphiQL: ${chalk.bold.underline(
        `http://localhost:${actualPort}/graphiql`
      )}`
    );
    console.log();
  });

  // Nodemon SIGUSR2 handling
  const shutdownActions = app.shutdownActions;
  shutdownActions.push(() => {
    app.server.close();
  });
}

main().catch((e) => {
  console.error("Fatal error occurred starting server!");
  console.error(e);
  process.exit(101);
});
