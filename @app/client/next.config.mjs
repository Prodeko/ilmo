import BundleAnalyzer from "@next/bundle-analyzer"
import { withSentryConfig } from "@sentry/nextjs"
import nextTranslate from "next-translate-plugin"

import localeConfig from "./i18n.js"

const { locales, defaultLocale } = localeConfig
const withBundleAnalyzer = BundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

// Turbopack is the default in Next 16. Detect the `--webpack` opt-out so
// next-translate-plugin can inject the right loader path; without this it
// emits webpack config that breaks Turbopack startup.
const isTurbopack = !process.argv.includes("--webpack")

if (!process.env.ROOT_URL) {
  if (process.argv[1].endsWith("/depcheck.js")) {
    /* NOOP */
  } else {
    throw new Error("ROOT_URL is a required envvar")
  }
}

const { NODE_ENV, ROOT_URL } = process.env
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test"

const remoteImageHosts = isDevOrTest
  ? [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "static.prodeko.org" },
      { protocol: "http", hostname: "placeimg.com" },
      { protocol: "https", hostname: "placeimg.com" },
    ]
  : [
      { protocol: "https", hostname: ROOT_URL.replace(/(^\w+:|^)\/\//, "") },
      { protocol: "https", hostname: "static.prodeko.org" },
    ]

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
  // antd, @ant-design/icons, and friends ship ESM with extensionless
  // relative imports that Node's strict ESM resolver rejects during page
  // data collection. Keep them on the bundler path on both client and
  // server.
  transpilePackages: [
    "@app/components",
    "antd",
    "@ant-design/icons",
    "@ant-design/cssinjs",
    "rc-util",
    "rc-pagination",
    "rc-picker",
    "antd-img-crop",
    "next-translate",
  ],
  turbopack: {
    resolveAlias: {
      // pg-native is an optional native binding that the `pg` driver tries
      // to resolve at runtime. We never install it; redirect to the JS
      // client so resolution succeeds.
      "pg-native": "pg/lib/client",
      // `ws` is a server-only dep pulled in transitively. Stub it out for
      // the browser bundle so Turbopack doesn't try to bundle it client-side.
      ws: { browser: "./empty.js" },
    },
  },
  images: {
    minimumCacheTTL: 31536000,
    formats: ["image/avif", "image/webp"],
    remotePatterns: remoteImageHosts,
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

const nextConfig = withBundleAnalyzer(
  nextTranslate(nextOptions, { turbopack: isTurbopack })
)

const sentryOptions = {
  org: "prodeko",
  project: "ilmo",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: process.env.NODE_ENV !== "production",
}

export default process.env.DOCKER_BUILD
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig
