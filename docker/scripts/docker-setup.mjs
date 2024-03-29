import { runSync } from "../../scripts/lib/run.mjs"
import { basename, dirname, resolve } from "path"
import { platform } from "os"
import { safeRandomString } from "../../scripts/lib/random.mjs"
import fs from "fs"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const fsp = fs.promises

const DOCKER_DOTENV_PATH = `${__dirname}/../.env`

if (platform() !== "win32" && !process.env.UID) {
  console.error(
    "You should run `export UID` before running 'yarn docker setup' otherwise you may end up with permissions issues."
  )
  process.exit(1)
}

async function main() {
  // Check that docker/.env exists
  try {
    await fsp.access(DOCKER_DOTENV_PATH, fs.constants.F_OK)
  } catch (e) {
    // Does not exist, write it
    const password = safeRandomString(30)
    const data = `
# We'd like scripts ran through Docker to pretend they're in a normal
# interactive terminal.
FORCE_COLOR=2

# \`pg_dump\` is run from inside container, which doesn't have pg tools installed
# so it needs a way to still run it. \`docker compose run\` would start an
# instance inside the current running container which doesn't work with volume
# mappings, so we must use \`docker compose exec\`. \`-T\` is needed because our
# \`.gmrc\` checks for interactive TTY.
PG_DUMP="docker compose exec -T db pg_dump"

# Drops tables without asking in \`yarn setup\`. Reasoning: 1) docker compose is
# not tty, 2) it's a dev env anyway.
CONFIRM_DROP=y

# POSTGRES_PASSWORD is the superuser password for PostgreSQL, it's required to
# initialize the Postgres docker volume.
POSTGRES_PASSWORD="${password}"

# We're accessing Postgres via Docker, so we must use the db host and the
# relevant password.
DATABASE_HOST=db
ROOT_DATABASE_URL="postgres://postgres:${password}@db/postgres"

# Allows us to ignore changes in tables you don't care about. Used in conjunction with @graphile/subscriptions-lds
LD_TABLE_PATTERN=app_public.*

# Since we are using a custom server, we need to specify the folder in which the frontend lives to make next-translate work properly
NEXT_TRANSLATE_PATH=../client

# Redis is used for session storage and as a rate limiting store
REDIS_URL=redis://redis:6379

# Specify Sentry error tracking Data Source Name and CSP report uri
SENTRY_DSN=
SENTRY_REPORT_URI=

# Emails
SENDGRID_USERNAME=apikey
SENDGRID_API_KEY=
`
    await fsp.writeFile(DOCKER_DOTENV_PATH, data)
  }

  // The `docker-compose` project name defaults to the directory name containing
  // `docker-compose.yml`, which is the root folder of our project. Let's call
  // that 'ROOT'. We're in ROOT/docker/scripts and we want to get the name of
  // ROOT:
  const projectName = basename(dirname(dirname(resolve(__dirname))))

  // On Windows we must run 'yarn.cmd' rather than 'yarn'
  const yarnCmd = platform === "win32" ? "yarn.cmd" : "yarn"

  runSync(yarnCmd, ["down"])
  runSync(yarnCmd, ["db:up"])
  runSync(yarnCmd, ["redis:up"])

  // Fix permissions
  runSync(yarnCmd, [
    "compose",
    "run",
    "server",
    "sudo",
    "bash",
    "-c",
    "chmod o+rwx /var/run/docker.sock && chown -R node:node /work/node_modules",
  ])

  // Install packages
  runSync(yarnCmd, ["compose", "run", "server", "yarn", "install"])

  // Run setup as normal
  runSync(yarnCmd, [
    "compose",
    "run",
    "-e",
    `PROJECT_NAME=${projectName}`,
    "server",
    "yarn",
    "setup",
  ])
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
