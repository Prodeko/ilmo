require("@app/config")
const compose = require("lodash/flowRight")
const { locales, defaultLocale } = require("./i18n.js")
const AntDDayjsWebpackPlugin = require("antd-dayjs-webpack-plugin")

if (!process.env.ROOT_URL) {
  if (process.argv[1].endsWith("/depcheck")) {
    /* NOOP */
  } else {
    throw new Error("ROOT_URL is a required envvar")
  }
}

const { NODE_ENV } = process.env
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
;(function (process = null) {
  // You *must not* use `process.env` in here, because we need to check we have
  // those variables. To enforce this, we've deliberately shadowed process.
  module.exports = () => {
    const path = require("path")

    const withTM = require("next-transpile-modules")([
      "@app/components",
      "@app/lib",
    ])
    const withAntdLess = require("next-plugin-antd-less")
    const withNextTranslate = require("next-translate")

    return compose(
      withTM,
      withAntdLess,
      withNextTranslate
    )({
      useFileSystemPublicRoutes: true,
      poweredByHeader: false,
      trailingSlash: false,
      lessVarsFilePath: path.resolve(__dirname, "./assets/antd-custom.less"),
      cssLoaderOptions: {
        esModule: false,
        sourceMap: false,
        modules: {
          mode: "local",
        },
      },
      i18n: {
        locales,
        defaultLocale,
      },
      images: {
        domains: [isDevOrTest ? "placeimg.com" : ""],
      },
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

        return {
          ...config,
          plugins: [
            ...config.plugins,
            new webpack.DefinePlugin({
              /*
               * IMPORTANT: we don't want to hard-code these values, otherwise
               * we cannot promote a bundle to another environment. Further,
               * they need to be valid both within the browser _AND_ on the
               * server side when performing SSR.
               */
              "process.env.ROOT_URL":
                "(typeof window !== 'undefined' ? window.__ILMO_APP__.ROOT_URL : process.env.ROOT_URL)",
              "process.env.T_AND_C_URL":
                "(typeof window !== 'undefined' ? window.__ILMO_APP__.T_AND_C_URL : process.env.T_AND_C_URL)",
              "process.env.SENTRY_DSN":
                "(typeof window !== 'undefined' ? window.__ILMO_APP__.SENTRY_DSN : process.env.SENTRY_DSN)",
              "process.env.ENABLE_REGISTRATION":
                "(typeof window !== 'undefined' ? window.__ILMO_APP__.ENABLE_REGISTRATION : process.env.ENABLE_REGISTRATION)",
            }),
            new webpack.IgnorePlugin(
              // These modules are server-side only; we don't want webpack
              // attempting to bundle them into the client.
              /^(node-gyp-build|bufferutil|utf-8-validate)$/
            ),
            new AntDDayjsWebpackPlugin(),
          ],
          externals: [
            ...(externals || []),
            isServer ? { "pg-native": "pg/lib/client" } : null,
          ].filter((_) => _),
        }
      },
    })
  }
})()
