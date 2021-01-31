import * as Sentry from "@sentry/node";
import {
  extractTraceparentData,
  stripUrlQueryAndFragment,
} from "@sentry/tracing";
import { Transaction } from "@sentry/types";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    __sentry_transaction: Transaction;
  }
}

// Adapted from https://docs.sentry.io/platforms/node/guides/koa/
const SentryRequestHandler: FastifyPluginAsync = async (app) => {
  app.decorate("__sentry_transaction", null);
  app.addHook("onRequest", async (req, res) => {
    const reqMethod = (req.method || "").toUpperCase();
    const reqUrl = req.url && stripUrlQueryAndFragment(req.url);

    // connect to trace of upstream app
    let traceparentData;
    if (req["sentry-trace"]) {
      traceparentData = extractTraceparentData(req["sentry-trace"]);
    }

    const transaction = Sentry.startTransaction({
      name: `${reqMethod} ${reqUrl}`,
      op: "http.server",
      ...traceparentData,
    });
    app.__sentry_transaction = transaction;

    transaction.setHttpStatus(res.statusCode);
    transaction.finish();
  });
};

const SentryErrorHandler: FastifyPluginAsync = async (app) => {
  app.addHook("onError", async (_req, _reply, error) => {
    Sentry.captureException(error);
  });
};

export const installSentryRequestHandler = fp(SentryRequestHandler);
export const installSentryErrorHandler = fp(SentryErrorHandler);
