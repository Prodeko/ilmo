import BundleAnalyzer from "@next/bundle-analyzer"
import { withSentryConfig } from "@sentry/nextjs"
import _ from "lodash"
import withNextTranslate from "next-translate-plugin"

import localeConfig from "./i18n.js"

const __dirname = new URL(".", import.meta.url).pathname
const { locales, defaultLocale } = localeConfig
const withBundleAnalyzer = BundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

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
  transpilePackages: [
    "@app/components",
    "@ant-design/icons",
    "@ant-design/icons-svg",
    "rc-pagination",
    "rc-picker",
    "rc-table",
    "rc-tree",
    "rc-util",
  ],
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
    withNextTranslate,
    withBundleAnalyzer
  )({
    ...nextOptions,
    webpack(config, { webpack, dev, isServer }) {
      const makeSafe = (externals) => {
        if (Array.isArray(externals)) {
          return externals.map((ext) => {
            if (typeof ext === "function") {
              return (obj, callback) => {
                if (/^@app\//.test(obj.request)) {
                  callback()
                } else {
                  return ext(obj, callback)
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

      if (!isServer) {
        config.resolve.fallback.fs = false
        config.plugins.push(
          new webpack.IgnorePlugin({
            // These modules are server-side only; we don't want webpack
            // attempting to bundle them into the client.
            resourceRegExp: /^(node-gyp-build|bufferutil|utf-8-validate|ws)$/,
          })
        )
      }

      const nextConf = {
        ...config,
        plugins: [...config.plugins],
        externals: [
          ...(externals || []),
          isServer ? { "pg-native": "pg/lib/client" } : null,
          { "node:buffer": "buffer" },
          { "node:crypto": "crypto" },
          { "node:http": "http" },
        ].filter((_) => _),
      }
      return nextConf
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
