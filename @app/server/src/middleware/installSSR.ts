import path from "path"

import { FastifyPluginAsync } from "fastify"
// TODO: Switch to @fastify/nextjs once it supports fastify v4
import FastifyNext from "fastify-next"
import fp from "fastify-plugin"

const SSR: FastifyPluginAsync = async (fastify) => {
  fastify
    .register(FastifyNext, {
      customServer: true,
      dir: path.resolve(`${__dirname}/../../../client`),
    })
    .after(() => {
      fastify.next("*")
    })
}

export default fp(SSR)
