if (parseInt(process.version.split(".")[0], 10) < 10) {
  throw new Error("This project requires Node.js >= 10.0.0")
}

const fsp = require("fs").promises
const { runSync } = require("./lib/run")
const { withDotenvUpdater, readDotenv } = require("./lib/dotenv")
const { safeRandomString, safeRandomHexString } = require("./lib/random")

// fixes runSync not throwing ENOENT on windows
const platform = require("os").platform()

const yarnCmd = platform === "win32" ? "yarn.cmd" : "yarn"

const projectName = process.env.PROJECT_NAME

exports.withDotenvUpdater = withDotenvUpdater
exports.readDotenv = readDotenv
exports.runSync = runSync
exports.yarnCmd = yarnCmd
exports.projectName = projectName

exports.updateDotenv = function updateDotenv(add, answers) {
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
    "LOG_LEVEL",
    "error",
    `\
# Server logging level. Only used in production. Available levels: fatal, error, warn, info, debug, trace.`
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
  add("DATABASE_OWNER_PASSWORD", safeRandomString(30))

  add(
    "DATABASE_AUTHENTICATOR",
    `${answers.DATABASE_NAME}_authenticator`,
    `\
# The PostGraphile database user, which has very limited
# privileges, but can switch into the DATABASE_VISITOR role`
  )

  add("DATABASE_AUTHENTICATOR_PASSWORD", safeRandomString(30))

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
    "ENABLE_REGISTRATION",
    0,
    `\
# Enable / disable account registrations (0 = don't allow users to register new accounts)`
  )

  if (projectName) {
    add(
      "COMPOSE_PROJECT_NAME",
      projectName,
      `\
# The name of the folder you cloned ilmo to (so we can run docker-compose inside a container):`
    )
  }
}

exports.checkGit = async function checkGit() {
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

exports.runMain = (main) => {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

exports.outro = (message) => {
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
