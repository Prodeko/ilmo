# Ilmo

## Requirements

- yarn
- Node v14
- Postgresql 11
- Redis
- (wal2json)

## NOT FOR BEGINNERS

We do not advise that you build your own projects on top of this project until
you're comfortable with the various tools it uses
([Node.js](https://nodejs.org/en/docs/),
[Fastify](https://github.com/fastify/fastify),
[PostgreSQL](https://www.postgresql.org/docs/current/index.html),
[GraphQL](https://graphql.org/learn/),
[PostGraphile](https://www.graphile.org/postgraphile/introduction/),
[Graphile Worker](https://github.com/graphile/worker),
[Graphile Migrate](https://github.com/graphile/migrate),
[TypeScript](https://www.typescriptlang.org/docs/),
[React](https://reactjs.org/docs/getting-started.html),
[Urql GraphQL client](https://formidable.com/open-source/urql/docs/basics/react-preact/),
[GraphQL Code Generator](https://github.com/dotansimha/graphql-code-generator),
[ESLint](https://eslint.org/),
[Prettier](https://prettier.io/docs/en/index.html), [Jest](https://jestjs.io/),
[Cypress](https://www.cypress.io/), etc).

This is an **advanced** project with deeply integrated tooling across the full
stack. The project is called "Starter" because it helps you to start new
projects with all these technologies, tools and techniques already in place. If
you're not already familiar with these things then you'll probably find the
project overwhelming, it is not intended to be your first experience of any of
these tools.

If you're just getting started with PostGraphile, before you dive into this
project make sure you check out the
[PostGraphile required knowledge](https://www.graphile.org/postgraphile/required-knowledge/)
and especially the
[schema design tutorial](https://www.graphile.org/postgraphile/postgresql-schema-design/).
This repository takes a slightly different approach to schema design than the
aforementioned tutorial, but it's still an incredibly valuable resource.

## Table of contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Running](#running)
- [Docker development](#docker-development-1)
- [Production build](#production-build-for-local-mode)
- [Deploying to Heroku](#deploying-to-heroku)
- [License](#mit-license)

## Prerequisites

You can either work with this project locally (directly on your machine) or use
a pre-configured Docker environment. We'll differentiate this in the README with
a table like this one:

| Local mode                      | OR  | Docker mode                              |
| ------------------------------- | :-: | ---------------------------------------- |
| _command for local development_ | or  | _command for docker-compose development_ |

**Be careful not to mix and match Docker-mode vs local-mode for development.**
You should make a choice and stick to it. (Developing locally but deploying with
`production.Docker` is absolutely fine.)

**IMPORTANT**: If you choose the Docker mode, be sure to read
[docker/README.md](docker/README.md).

For users of Visual Studio Code (VSCode), a `.vscode` folder is included with
editor settings and debugger settings provided, plus a list of recommended
extensions. Should you need it, there is also a `.devcontainer` folder which
enables you to use
[VSCode's remote containers](https://code.visualstudio.com/docs/remote/containers)
giving you a local-like development experience whilst still using docker
containers.

### Local development

Requires:

- Node.js v10+ must be installed (v12 recommended)
- PostgreSQL v10+ server must be available
- `pg_dump` command must be available (or you can remove this functionality)
- VSCode is recommended, but any editor will do

This software has been developed under Mac and Linux, and should work in a
`bash` environment.

### Docker development

Requires:

- [`docker`](https://docs.docker.com/install/)
- [`docker-compose`](https://docs.docker.com/compose/install/)
- Ensure you've allocated Docker **at least** 4GB of RAM; significantly more
  recommended
  - (Development only, production is much more efficient)

Has been tested on Windows and Linux (Ubuntu 18.04LTS).

## Getting started

This project is designed to work with `yarn`. If you don't have `yarn`
installed, you can install it with `npm install -g yarn`. The Docker setup
already has `yarn` & `npm` installed and configured.

To get started, please run:

| Local mode   | OR  | Docker mode                     |
| ------------ | :-: | ------------------------------- |
| `yarn setup` | or  | `export UID; yarn docker setup` |

This command will lead you through the necessary steps, and create a `.env` file
for you containing your secrets.

**NOTE:** `export UID` is really important on Linux Docker hosts, otherwise the
files and folders created by Docker will end up owned by root, which is
non-optimal. We recommend adding `export UID` to your `~/.profile` or
`~/.bashrc` or similar so you don't have to remember it.

**Do not commit `.env` to version control!**

## Running

You can bring up the stack with:

| Local mode   | OR  | Docker mode                     |
| ------------ | :-: | ------------------------------- |
| `yarn start` | or  | `export UID; yarn docker start` |

After a short period you should be able to load the application at
http://localhost:5678

This main command runs a number of tasks:

- uses [`graphile-migrate`](https://github.com/graphile/migrate) to watch
  the`migrations/current.sql` file for changes, and automatically runs it
  against your database when it changes
- watches the TypeScript source code of the server, and compiles it from
  `@app/*/src` to `@app/*/dist` so node/`graphile-worker`/etc. can run the
  compiled code directly
- runs the node server (includes PostGraphile and Next.js middleware)
- runs `graphile-worker` to execute your tasks (e.g. sending emails)
- watches your GraphQL files and your PostGraphile schema for changes and
  generates your TypeScript React hooks for you automatically, leading to
  strongly typed code with minimal effort
- runs the `jest` tests in watch mode, automatically re-running as the database
  or test files change

**NOTE**: `docker-compose up server` also runs the PostgreSQL server that the
system connects to.

You may also choose to develop locally, but use the PostgreSQL server via
`docker-compose up -d db`.

Then for development you may need a console; you can open one with:

| Local mode | OR  | Docker mode                    |
| ---------- | :-: | ------------------------------ |
| `bash`     | or  | `export UID; yarn docker bash` |

To shut everything down:

| Local mode | OR  | Docker mode                    |
| ---------- | :-: | ------------------------------ |
| Ctrl-c     | or  | `export UID; yarn docker down` |

## Docker development

Be sure to read [docker/README.md](docker/README.md).

## Building the production docker image

To build the production image, use `docker build` as shown below. You should
supply the `ROOT_URL` build variable (which will be baked into the client code,
so cannot be changed as envvars); if you don't then the defaults will apply
(which likely will not be suitable).

To build the worker, pass `--target worker` instead of the default
`--target server`.

```sh
docker build \
  --file production.Dockerfile \
  --build-arg ROOT_URL="http://localhost:5678" \
  --target server \
  .
```

When you run the image you must pass it the relevant environmental variables,
for example:

```sh
docker run --rm -it --init -p 5678:5678 \
  -e SECRET="$SECRET" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e DATABASE_VISITOR="$DATABASE_VISITOR" \
  -e DATABASE_URL="$DATABASE_URL" \
  -e AUTH_DATABASE_URL="$AUTH_DATABASE_URL" \
  docker-image-id-here
```

Currently if you miss required envvars weird things will happen; we don't
currently have environment validation (PRs welcome!).

## Production build for local mode

Use `yarn run build` to generate a production build of the project

## Deploying to Heroku

Prerequisites:

- Install the Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli

If you are using `graphile-migrate` make sure that you have executed
`graphile-migrate commit` to commit all your database changes, since we only run
committed migrations in production.

Make sure you have customized `@app/config/src/index.ts`.

Make sure everything is committed and pushed in git.

Set up a database server; we recommend using Amazon RDS.

Once your database server is running, you can use our `heroku-setup` script to
automate the setup process. This script does the following:

- Creates the Heroku app
- Adds the redis extension to this Heroku app
- Creates the database in the database server
- Creates the relevant roles, generating random passwords for them
- Installs some common database extensions
- Sets the Heroku config variables
- Adds the Heroku app as a git remote named 'Heroku'
- Pushes the 'master' branch to Heroku to perform your initial build

Create a copy of `heroku-setup.template` and rename the copy to `heroku-setup`,
then edit it and customize the settings at the top. We also recommend reading
through the script and customizing it as you see fit - particularly if you are
using additional extensions that need installing.

Now run the script:

```
bash heroku-setup
```

Hopefully all has gone well. If not, step through the remaining tasks in the
Heroku-setup script and fix each task as you go. We've designed the script so
that if your superuser credentials are wrong, or the Heroku app already exists,
you can just edit the settings and try again. All other errors will probably
need manual intervention. Verbosity is high so you can track exactly what
happened.

The server should be up and running now (be sure to access it over HTTPS
otherwise you will not be able to run GraphQL queries), but it is not yet
capable of sending emails. To achieve this, you must configure an email
transport. We have pre-configured support for Amazon SES. Once SES is set up,
your domain is verified, and you've verified any emails you wish to send email
to (or have had your sending limits removed), make sure that the `fromEmail` in
`@app/config/src/index.ts` is correct, and then create an IAM role for your
PostGraphile server. Here's an IAM template for sending emails - this is the
only permission required for our IAM role currently, but you may wish to add
others later.

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "ses:SendRawEmail",
            "Resource": "*"
        }
    ]
}
```

Generate an Access Key for this IAM role, and then tell Heroku the access key id
and secret:

```
heroku config:set AWS_ACCESS_KEY_ID="..." AWS_SECRET_ACCESS_KEY="..." -a $APP_NAME
```

Now you can tell Heroku to run the worker process as well as the currently
running 'web' process:

```
heroku ps:scale worker=1 -a $APP_NAME
```

When you register an account on the server you should receive a verification
email containing a clickable link. When you click the link your email will be
verified and thanks to GraphQL subscriptions the previous tab should be updated
to reflect that your account is now verified.

## Cleanup

To delete the Heroku app:

```
heroku apps:destroy -a $APP_NAME
```

To delete the database/roles (replace `dbname` with your database name):

```
drop database dbname;
drop role dbname_visitor;
drop role dbname_authenticator;
drop role dbname;
```

## Custom packages

When running `yarn setup`, this command will also invoke `lerna run setup`. This
allows you to add custom setup hooks necessary for your individual packages.

Add a line like the following to your `scripts` section in your `package.json`:

`"setup": "npm i -g some-package"`

## MIT License

This is open source software; you may use, modify and distribute it under the
terms of the MIT License, see
[GRAPHILE_STARTER_LICENSE.md](./GRAPHILE_STARTER_LICENSE.md).
