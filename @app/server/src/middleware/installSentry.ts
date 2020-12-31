import * as Sentry from "@sentry/node";
import { Express } from "express";

export const installSentryRequestHandler = (app: Express) => {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
};

export const installSentryErrorHandler = (app: Express) => {
  app.use(Sentry.Handlers.errorHandler());
};
