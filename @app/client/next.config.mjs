import BundleAnalyzer from "@next/bundle-analyzer"
import { withSentryConfig } from "@sentry/nextjs"
import _ from "lodash"
import withNextTranslate from "next-translate"
import NextTranspileModules from "next-transpile-modules"
import path from "node:path"

import localeConfig from "./i18n.js"

const __dirname = new URL(".", import.meta.url).pathname
// next-transpile-modules can't resolve workspace packages from
// `@app/server`'s working dir (where the SSR bridge bootstraps the config),
// so pass the resolved absolute path instead of the package name.
const componentsPath = path.resolve(__dirname, "../components")
const { locales, defaultLocale } = localeConfig
const withBundleAnalyzer = BundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})
const withTM = NextTranspileModules([
  componentsPath,
  // antd, @ant-design/icons, and friends ship ESM builds (`es/`) with
  // extensionless relative imports that Node's strict ESM resolver rejects.
  // Bundling them through webpack on both client and server keeps Node
  // out of the resolution path during page data collection.
  "antd",
  "@ant-design/icons",
  "@ant-design/cssinjs",
  "rc-util",
  "rc-pagination",
  "rc-picker",
  "antd-img-crop",
])

if (!process.env.ROOT_URL) {
  if (process.argv[1].endsWith("/depcheck.js")) {
    /* NOOP */
  } else {
    throw new Error("ROOT_URL is a required envvar")
  }
}

const { NODE_ENV, ROOT_URL } = process.env
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test"

/**
 * @type {import('next').NextConfig}
 */
const nextOptions = {
  useFileSystemPublicRoutes: true,
  poweredByHeader: false,
  trailingSlash: false,
  i18n: {
    locales,
    defaultLocale,
  },
  images: {
    minimumCacheTTL: 31536000,
    formats: ["image/avif", "image/webp"],
    domains: isDevOrTest
      ? ["localhost", "static.prodeko.org", "placeimg.com"]
      : [ROOT_URL.replace(/(^\w+:|^)\/\//, ""), "static.prodeko.org"],
  },
  async redirects() {
    return [
      {
        source: "/settings",
        destination: "/settings/profile",
        permanent: false,
      },
      {
        source: "/admin",
        destination: "/admin/event/list",
        permanent: false,
      },
    ]
  },
  env: {
    ENV: NODE_ENV,
    ROOT_URL: ROOT_URL,
    TZ: process.env.TZ,
    PRIVACY_URL: process.env.PRIVACY_URL,
  },
}

const nextConfig = () =>
  _.flowRight(
    withTM,
    withNextTranslate,
    withBundleAnalyzer
  )({
    ...nextOptions,
    webpack(config, { webpack, dev, isServer }) {
      const makeSafe = (externals) => {
        if (Array.isArray(externals)) {
          return externals.map((ext) => {
            if (typeof ext === "function") {
              return ({ request, ...rest }, callback) => {
                if (/^@app\//.test(request)) {
                  callback()
                } else {
                  return ext({ request, ...rest }, callback)
                }
              }
            } else {
              return ext
            }
          })
        }
      }

      const externals =
        isServer && dev ? makeSafe(config.externals) : config.externals

      if (isServer) {
        // For bare specifiers (e.g. `@ant-design/icons`), prefer the CJS
        // `main` field over the `module` field. The ESM builds of these
        // packages use extensionless relative imports that Node's strict
        // ESM resolver rejects when Next collects page data.
        config.resolve.mainFields = ["main", "module"]
      } else {
        config.resolve.fallback.fs = false
        config.plugins.push(
          new webpack.IgnorePlugin(
            // These modules are server-side only; we don't want webpack
            // attempting to bundle them into the client.
            {
              resourceRegExp: /^(ws)$/,
            }
          )
        )
      }

      return {
        ...config,
        externals: [
          ...(externals || []),
          isServer ? { "pg-native": "pg/lib/client" } : null,
        ].filter((_) => _),
      }
    },
  })

// Options https://github.com/getsentry/sentry-webpack-plugin#options
export default process.env.DOCKER_BUILD
  ? withSentryConfig(nextConfig, {
      release: process.env.GITHUB_SHA || "local",
      configFile: `${__dirname}sentry.properties`,
      silent: process.env.NODE_ENV !== "production",
      environment: process.env.NODE_ENV,
    })
  : nextConfig
