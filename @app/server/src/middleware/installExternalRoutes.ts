import { FastifyPluginAsync, RouteOptions } from "fastify"
import fp from "fastify-plugin"

import {
  ExternalRouteModule,
  externalRoutes as registry,
} from "../externalRoutes"
import { isFeatureEnabled as readFeatureFlag } from "../utils/featureFlags"

import type { FeatureKey } from "@app/lib"

export interface ExternalRoutesOptions {
  /** Defaults to the registry in externalRoutes.ts. */
  externalRoutes?: readonly ExternalRouteModule[]
  /** Defaults to the server's `isFeatureEnabled`. */
  isFeatureEnabled?: (key: FeatureKey) => Promise<boolean>
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
 * route it did not declare is an error, and in which the routes answer 404
 * while the module's feature flag is off (checked per request; the CSRF
 * check of a non-exempt route still runs first).
 */
const ExternalRoutes: FastifyPluginAsync<ExternalRoutesOptions> = async (
  app,
  { externalRoutes = registry, isFeatureEnabled = readFeatureFlag }
) => {
  for (const module of externalRoutes) {
    if (!module.configured()) {
      app.log.info(`${module.name}: not configured, routes not registered`)
      continue
    }
    await app.register(async (scope) => {
      scope.addHook("onRoute", (route) => assertDeclared(module, route))
      const { feature } = module
      if (feature && module.gateWhenOff !== false) {
        scope.addHook("onRequest", async (_request, reply) => {
          if (!(await isFeatureEnabled(feature))) {
            reply.callNotFound()
            return reply
          }
        })
      }
      await scope.register(module.register)
    })
  }
}

export default fp(ExternalRoutes)
