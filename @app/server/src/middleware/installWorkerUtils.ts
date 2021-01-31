import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { makeWorkerUtils, WorkerUtils } from "graphile-worker";

declare module "fastify" {
  export interface FastifyInstance {
    workerUtils: WorkerUtils;
  }
}

const InstallWorkerUtils: FastifyPluginAsync = async (app) => {
  const workerUtils = await makeWorkerUtils({
    pgPool: app.rootPgPool,
  });

  app.decorate("workerUtils", workerUtils);
};

export default fp(InstallWorkerUtils);
