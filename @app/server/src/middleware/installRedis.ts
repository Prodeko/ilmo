import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import fastifyRedis from "fastify-redis";

const Redis: FastifyPluginAsync = async (app) => {
  app.register(fastifyRedis, { url: process.env.REDIS_URL });
  const client = app.redis;

  const shutdownActions = app.shutdownActions;
  shutdownActions.push(() => {
    client.quit();
  });
};

export default fp(Redis);
