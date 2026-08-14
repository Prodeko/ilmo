import { promises as fsp } from "fs"
import { platform } from "os"
import { URL } from "url"

import { safeRandomHexString,safeRandomString } from "./lib/random.mjs"

if (parseInt(process.version.slice(1).split(".")[0], 10) < 20) {
  throw new Error("This project requires Node.js >= 20.0.0")
}
export { readDotenv,withDotenvUpdater } from "./lib/dotenv.mjs"
export { runSync } from "./lib/run.mjs"

export function dirname(meta) {
  return new URL(".", meta.url).pathname
}

const __dirname = dirname(import.meta)
// fixes runSync not throwing ENOENT on windows
export const pnpmCmd = platform() === "win32" ? "pnpm.cmd" : "pnpm"
export const projectName = process.env.PROJECT_NAME

export function updateDotenv(add, answers) {
  add(
    "NODE_ENV",
    "development",
    `\
# This is a development environment (production wouldn't write envvars to a file)`
  )

  add(
    "TZ",
    "Europe/Helsinki",
    `\
# Timezone for the server`
  )

  add(
    "PORT",
    "5678",
    `\
# The port that the server listens on.`
  )

  add(
    "ROOT_DATABASE_URL",
    null,
    `\
# Superuser connection string (to a _different_ database), so databases can be dropped/created (may not be necessary in production)`
  )

  add(
    "DATABASE_HOST",
    null,
    `\
# Where's the DB, and who owns it?`
  )

  add("DATABASE_NAME")
  add("DATABASE_OWNER", answers.DATABASE_NAME)
  add("AZURE_DB_OWNER", answers.DATABASE_NAME)
  add("DATABASE_OWNER_PASSWORD", `"${safeRandomString(30)}"`)

  add(
    "DATABASE_AUTHENTICATOR",
    `${answers.DATABASE_NAME}_authenticator`,
    `\
# The PostGraphile database user, which has very limited
# privileges, but can switch into the DATABASE_VISITOR role`
  )

  add("DATABASE_AUTHENTICATOR_PASSWORD", `"${safeRandomString(30)}"`)

  add(
    "DATABASE_VISITOR",
    `${answers.DATABASE_NAME}_visitor`,
    `\
# Visitor role, cannot be logged into directly`
  )

  add(
    "SECRET",
    safeRandomHexString(64),
    `\
# This secret is used for signing cookies`
  )

  add(
    "JWT_SECRET",
    safeRandomString(48),
    `\
# This secret is used for signing JWT tokens (we don't use this by default)`
  )

  add(
    "PORT",
    "5678",
    `\
# This port is the one you'll connect to`
  )

  const rootUrl = answers.ROOT_URL || "http://localhost:5678"

  add(
    "ROOT_URL",
    rootUrl,
    `\
# This is needed any time we use absolute URLs
# IMPORTANT: must NOT end with a slash`
  )

  add(
    "KEYCLOAK_ISSUER",
    null,
    `\
# Keycloak SSO (id.prodeko.org). To enable, register an OIDC client in the
# membership-registry realm following docs/keycloak-clients.md in the
# membership-registry repo, then fill in these three values.
#
#   Valid redirect URIs:        ${rootUrl}/auth/keycloak/callback
#   Local dev issuer:           http://localhost:8180/realms/membership-registry
#   Production issuer:          https://id.prodeko.org/realms/membership-registry
#
# IMPORTANT: KEYCLOAK_ISSUER must NOT end with a slash.`
  )

  add(
    "KEYCLOAK_CLIENT_ID",
    null,
    `\
# Client ID (e.g. ilmokilke):`
  )

  add(
    "KEYCLOAK_CLIENT_SECRET",
    null,
    `\
# Client secret from the Keycloak admin console:`
  )

  add(
    "GRAPHILE_TURBO",
    "1",
    `\
# Enables advanced PostGraphile optimisations`
  )

  add(
    "LD_TABLE_PATTERN",
    "app_public.*",
    `\
# Allows us to ignore changes in tables you don't care about. Used in conjunction with @graphile/subscriptions-lds`
  )

  add(
    "NEXT_TRANSLATE_PATH",
    "../client",
    `\
# Since we are using a custom server, we need to specify the folder in which the frontend lives to make next-translate work properly`
  )

  add(
    "REDIS_URL",
    answers.REDIS_URL,
    `\
# Redis is used for session storage and as a rate limiting store`
  )

  add(
    "SENTRY_DSN",
    "",
    `\
# Specify Sentry error tracking Data Source Name and CSP report uri`
  )

  add("SENTRY_REPORT_URI", "")

  add(
    "AZURE_STORAGE_CONNECTION_STRING",
    null,
    `\
# Azure blob storage connection string. If set, file uploads use the Azure backend, otherwise files are saved locally.`
  )

  add(
    "AZURE_TRANSLATE_API_URL",
    null,
    `\
# API url for the Azure translation service to use.
# See https://docs.microsoft.com/en-us/azure/cognitive-services/translator/reference/v3-0-reference#base-urls
# for available options.`
  )

  add(
    "AZURE_TRANSLATE_SUBSCRIPTION_KEY",
    null,
    `\
# Subscription key for the Azure Translate resource.`
  )

  add(
    "PRIVACY_URL",
    null,
    `\
# Link to a privacy policy. Displayed in the application footer.`
  )
}

export const checkGit = async function checkGit() {
  try {
    const gitStat = await fsp.stat(`${__dirname}/../.git`)
    if (!gitStat || !gitStat.isDirectory()) {
      throw new Error("No .git folder found")
    }
  } catch (e) {
    console.error()
    console.error()
    console.error()
    console.error(
      "ERROR: Ilmo must run inside of a git versioned folder. Please run the following:"
    )
    console.error()
    console.error("  git init")
    console.error("  git add .")
    console.error("  git commit -m 'Ilmo base'")
    console.error()
    process.exit(1)
  }
}

export const runMain = (main) => {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

export const outro = (message) => {
  console.log()
  console.log()
  console.log("____________________________________________________________")
  console.log()
  console.log()
  console.log(message)
  console.log()
  console.log()
  console.log("____________________________________________________________")
  console.log()
}
