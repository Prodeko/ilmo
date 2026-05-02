# Ilmo

## Requirements

- Node.js v20 LTS
- pnpm 10 (`npm install -g pnpm`)
- Docker (for db + redis services)
- PostgreSQL with wal2json — the project ships a Docker image with wal2json included, so no host install is needed

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
etc).

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

## Quickstart

```bash
docker compose up -d db redis
cp .env.ci .env  # or run `pnpm setup` for interactive config
pnpm install
CONFIRM_DROP=1 pnpm setup:db
pnpm dev
```

The server runs on http://localhost:5678. The Postgres (with wal2json) and Redis
services run in Docker; everything else runs on the host.

## Table of contents

- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Running](#running)
- [Production build](#building-the-production-docker-image)
- [License](#mit-license)

## Getting started

Install [pnpm](https://pnpm.io/) globally:

```sh
npm install -g pnpm
```

Then install dependencies:

```sh
pnpm install
```

Start the data services (PostgreSQL with wal2json, and Redis) in Docker:

```sh
docker compose up -d db redis
```

Set up your `.env` file. For a quick start you can copy the CI defaults:

```sh
cp .env.ci .env
```

Or run the interactive setup script:

```sh
pnpm setup
```

This will lead you through the necessary steps and create a `.env` file
containing your secrets.

**Do not commit `.env` to version control!**

Once your environment is configured, initialise the database:

```sh
CONFIRM_DROP=1 pnpm setup:db
```

## Running

Bring up the full development stack with:

```sh
pnpm dev
```

After a short period you should be able to load the application at
http://localhost:5678

This main command runs a number of tasks:

- uses [`graphile-migrate`](https://github.com/graphile/migrate) to watch
  the `migrations/current.sql` file for changes, and automatically runs it
  against your database when it changes
- watches the TypeScript source code of the server, and compiles it from
  `@app/*/src` to `@app/*/dist` so node/`graphile-worker`/etc. can run the
  compiled code directly
- runs the node server (includes PostGraphile and Next.js middleware)
- runs `graphile-worker` to execute your tasks (e.g. sending emails)
- watches your GraphQL files and your PostGraphile schema for changes and
  generates your TypeScript React hooks for you automatically, leading to
  strongly typed code with minimal effort

To shut down the application press Ctrl-c. To stop the Docker data services:

```sh
docker compose down
```

### Useful commands

Run tests:

```sh
pnpm test
```

Lint:

```sh
pnpm lint
```

Build for production:

```sh
pnpm build
```

Database helpers:

```sh
pnpm db <cmd>
```

Server helpers:

```sh
pnpm server <cmd>
```

Run a command in a specific workspace:

```sh
pnpm --filter @app/foo run <cmd>
```

## Building the production docker image

To build the production image, use `docker build` as shown below. You should
supply the `ROOT_URL` build variable (which will be baked into the client code,
so cannot be changed as envvars); if you don't then the defaults will apply
(which likely will not be suitable).

To build the worker, pass `--target worker` instead of the default
`--target server`.

```sh
docker build \
  --file ./docker/dockerfiles/Dockerfile.prod \
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

## MIT License

This is open source software; you may use, modify and distribute it under the
terms of the MIT License, see [LICENSE.md](./LICENSE.md).
