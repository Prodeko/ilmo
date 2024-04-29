import path from "path"

import FastifyNext from "@fastify/nextjs"
import { FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"

const SSR: FastifyPluginAsync = async (fastify) => {
  fastify
    .register(FastifyNext, {
      customServer: true,
      dir: path.resolve(`${__dirname}/../../../client`),
      dev: process.env.NODE_ENV !== "production",
      underPressure: {
        exposeStatusRoute: true,
      },
    })
    .after(() => {
      fastify.next("*")
    })
}

export default fp(SSR)
