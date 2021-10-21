/// <reference types="cypress" />

const wp = require("@cypress/webpack-preprocessor")
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")
const webpack = require("webpack")

/**
 * @type {Cypress.PluginConfig}
 */
module.exports = (on, config) => {
  const options = {
    webpackOptions: {
      plugins: [
        new webpack.DefinePlugin({
          // neat-csv uses process.versions.node which is not
          // defined in a browser environment. So we define that
          // here.
          "process.versions.node": JSON.stringify(
            process.versions.node || "0.0.0"
          ),
        }),
        new NodePolyfillPlugin(),
      ],
      resolve: {
        extensions: [".ts", ".js"],
      },
      module: {
        rules: [
          {
            test: /\.ts$/,
            exclude: [/node_modules/],
            use: [
              {
                loader: "ts-loader",
                options: { transpileOnly: true },
              },
            ],
          },
        ],
      },
    },
  }
  on("file:preprocessor", wp(options))

  if (process.env.CI) {
    // CI seems to be pretty slow, lets be more forgiving
    config.defaultCommandTimeout = 30000 // default 4000
    config.requestTimeout = 20000 // default 5000
  }
  return config
}
