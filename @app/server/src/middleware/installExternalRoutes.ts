import { FastifyPluginAsync, RouteOptions } from "fastify"
import fp from "fastify-plugin"

import {
  ExternalRouteModule,
  externalRoutes as registry,
} from "../externalRoutes"

export interface ExternalRoutesOptions {
  /** Defaults to the registry in externalRoutes.ts. */
  externalRoutes?: readonly ExternalRouteModule[]
}

function isDeclared(module: ExternalRouteModule, method: string, url: string) {
  return module.paths.some(
    (declared) =>
      declared.path === url &&
      // Fastify adds a HEAD route for every GET route
      (declared.method === method ||
        (method === "HEAD" && declared.method === "GET"))
  )
}

function assertDeclared(module: ExternalRouteModule, route: RouteOptions) {
  const methods = Array.isArray(route.method) ? route.method : [route.method]
  for (const method of methods) {
    if (!isDeclared(module, method, route.url)) {
      throw new Error(
        `External route module '${module.name}' registered ${method} ${route.url}, which is not in its paths`
      )
    }
  }
}

/**
 * Registers the routes of every configured module in the external route
 * registry. Each module gets its own encapsulated context, in which any
 * route it did not declare is an error.
 */
const ExternalRoutes: FastifyPluginAsync<ExternalRoutesOptions> = async (
  app,
  { externalRoutes = registry }
) => {
  for (const module of externalRoutes) {
    if (!module.configured()) {
      app.log.info(`${module.name}: not configured, routes not registered`)
      continue
    }
    await app.register(async (scope) => {
      scope.addHook("onRoute", (route) => assertDeclared(module, route))
      await scope.register(module.register)
    })
  }
}

export default fp(ExternalRoutes)
