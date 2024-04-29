import { promises as fsp } from "fs"
import { platform } from "os"
import { URL } from "url"

import { safeRandomHexString, safeRandomString } from "./lib/random.mjs"

if (parseInt(process.version.split(".")[0], 16) < 16) {
  throw new Error("This project requires Node.js >= 16.0.0")
}
export { readDotenv, withDotenvUpdater } from "./lib/dotenv.mjs"
export { runSync } from "./lib/run.mjs"

export function dirname(meta) {
  return new URL(".", meta.url).pathname
}

const __dirname = dirname(import.meta)
// fixes runSync not throwing ENOENT on windows
export const yarnCmd = platform() === "win32" ? "yarn.cmd" : "yarn"
export const projectName = process.env.PROJECT_NAME

export function updateDotenv(add, answers) {
  add(
    "NX_REJECT_UNKNOWN_LOCAL_CACHE",
    "0",
    `\
# Silence nx unknown local cache warnings (https://nx.dev/troubleshooting/unknown-local-cache)`
  )

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

  add(
    "ROOT_URL",
    "http://localhost:5678",
    `\
# This is needed any time we use absolute URLs
# IMPORTANT: must NOT end with a slash`
  )

  add(
    "PRODEKO_OAUTH_KEY",
    null,
    `\
# To enable login with Prodeko credentials, create a Oauth2 application by visiting
# https://prodeko.org/oauth2/applications/register/ and then enter the Client
# ID/Secret and auth root url (dev: http://localhost:8000, prod: https://prodeko.org) below
#
#   Name: Ilmo
#   Client type: 'confidential'
#   Authorization grant type: 'Authorization code'
#   Redirect uris: http://localhost:5678/auth/oauth2/callback
#
# Client ID:`
  )

  add(
    "PRODEKO_OAUTH_SECRET",
    null,
    `\
# Client Secret:`
  )

  add(
    "PRODEKO_OAUTH_ROOT_URL",
    null,
    `\
# Oauth root url:
# IMPORTANT: must NOT end with a slash`
  )

  const nodeVersion = parseInt(
    process.version.replace(/\..*$/, "").replace(/[^0-9]/g, ""),
    10
  )

  add(
    "GRAPHILE_TURBO",
    nodeVersion >= 14 ? "1" : "",
    `\
# Set to 1 only if you're on Node v14 of higher; enables advanced optimisations`
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
# Since we are using a custom server, we need to specify the folder in which the frontend lives to make next-translate-plugin work properly`
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
    "REGISTER_DOMAINS_ALLOWLIST",
    "prodeko.org",
    `\
# Comma separated list of domain from which to allow registrations`
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
