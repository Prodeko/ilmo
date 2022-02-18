import AntDDayjsWebpackPlugin from "antd-dayjs-webpack-plugin"
import _ from "lodash"
import { withSentryConfig } from "@sentry/nextjs"
import BundleAnalyzer from "@next/bundle-analyzer"
import NextTranspileModules from "next-transpile-modules"
import withAntdLess from "next-plugin-antd-less"
import withNextTranslate from "next-translate"

import localeConfig from "./i18n.js"

const __dirname = new URL(".", import.meta.url).pathname
const { locales, defaultLocale } = localeConfig
const withBundleAnalyzer = BundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})
const withTM = NextTranspileModules([
  // Transpile components and lib according to @app/client/.babelrc.
  // This is needed to have correct styling as babel-plugin-import
  // inserts the required styles
  "@app/components",
  "rc-util",
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

const withAntdLessOptions = {
  lessVarsFilePath: `${__dirname}/src/styles/antd-custom.less`,
  cssLoaderOptions: {
    esModule: false,
    sourceMap: false,
    modules: {
      mode: "local",
    },
  },
}

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
    withAntdLess,
    withNextTranslate,
    withBundleAnalyzer
  )({
    ...nextOptions,
    ...withAntdLessOptions,
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

      if (!isServer) {
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

      const nextConf = {
        ...config,
        plugins: [...config.plugins, new AntDDayjsWebpackPlugin()],
        externals: [
          ...(externals || []),
          isServer ? { "pg-native": "pg/lib/client" } : null,
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
