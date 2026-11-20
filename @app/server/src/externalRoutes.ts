import { mcpRoutes } from "./mcp/routes"
import { stripeWebhook } from "./stripeWebhook"
import { telegramWebhook } from "./telegramWebhook"

import type { FeatureKey } from "@app/lib"
import type { FastifyPluginAsync } from "fastify"

/**
 * Routes that are called from outside the web client: webhooks, API
 * endpoints for other programs and similar. Every such route is declared
 * here, in `externalRoutes`, and nowhere else:
 *
 * - `installExternalRoutes` registers the modules that are configured and
 *   refuses any route a module registers without declaring it.
 * - `installCSRFProtection` exempts the declared `csrfExempt` paths of the
 *   configured modules, and only those, from the CSRF token check.
 *
 * GraphQL, the SSR pages and the login routes are not external routes.
 */

export type ExternalRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface ExternalRoutePath {
  method: ExternalRouteMethod
  /**
   * The exact URL path the module registers, without a query string or
   * route parameters.
   */
  path: string
  /**
   * Skips the CSRF token check for this method and path. Only for routes
   * that never read the session cookie and authenticate the caller some
   * other way: a signature, a bearer token or a shared secret.
   */
  csrfExempt?: boolean
}

export interface ExternalRouteModule {
  /** Shown in logs and errors. */
  name: string
  /** Every route the module registers. */
  paths: readonly ExternalRoutePath[]
  /**
   * Whether the server has the settings this module needs. A module that is
   * not configured has no routes and no CSRF exemptions.
   */
  configured: () => boolean
  /**
   * Key of the feature flag that controls this module's routes.
   * `installExternalRoutes` answers 404 on them, per request, while the flag
   * is off (unless `gateWhenOff` is false).
   */
  feature?: FeatureKey
  /**
   * Whether the flag gate applies to the routes. Defaults to true; false
   * keeps the routes answering while the flag is off, for callers that must
   * always get through.
   */
  gateWhenOff?: boolean
  /** Registers the routes. Runs only when `configured()` is true. */
  register: FastifyPluginAsync
}

/** The registry. Add a module here; do not edit app.ts or the CSRF plugin. */
export const externalRoutes: readonly ExternalRouteModule[] = [
  telegramWebhook,
  mcpRoutes,
  stripeWebhook,
]

export interface CsrfExemption {
  method: ExternalRouteMethod
  path: string
}

/** The CSRF-exempt paths of the configured modules. */
export function csrfExemptions(
  modules: readonly ExternalRouteModule[] = externalRoutes
): CsrfExemption[] {
  return modules
    .filter((module) => module.configured())
    .flatMap((module) => module.paths)
    .filter((path) => path.csrfExempt)
    .map(({ method, path }) => ({ method, path }))
}

/**
 * Whether a request is to an exempt method and path. The path must match
 * exactly; the query string is ignored, as it is when Fastify routes the
 * request.
 */
export function isCsrfExempt(
  exemptions: readonly CsrfExemption[],
  method: string,
  url: string
): boolean {
  const queryStart = url.indexOf("?")
  const path = queryStart === -1 ? url : url.slice(0, queryStart)
  return exemptions.some(
    (exemption) => exemption.method === method && exemption.path === path
  )
}
