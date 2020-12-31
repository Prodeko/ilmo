import { Express } from "express";
import { createNodeRedisClient, WrappedNodeRedisClient } from "handy-redis";

import { getShutdownActions } from "../app";

export function getRedisClient(app: Express): WrappedNodeRedisClient {
  return app.get("redisClient");
}

export default (app: Express) => {
  const client = createNodeRedisClient({ url: process.env.REDIS_URL });

  app.set("redisClient", client);

  const shutdownActions = getShutdownActions(app);
  shutdownActions.push(() => {
    client.quit();
  });
};
