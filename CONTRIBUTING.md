# Contributing

We welcome contributions; but please don't expand the scope of the project
without first discussing it with the maintainers (by opening an issue).

## Migrations

The database schema is managed with
[graphile-migrate](https://github.com/graphile/migrate). Released migrations
live in `@app/db/migrations/committed/`. Work in progress lives in
`@app/db/migrations/current/`, which `pnpm dev` (through `pnpm db watch`)
re-applies to your development database on every save.

### In a pull request

- Put your SQL in `@app/db/migrations/current/NN-<feature>.sql`: one file per
  feature, named with the next free number, for example
  `3-event-ribbon-text.sql`. Numbers must be unique; graphile-migrate runs the
  files in numeric order and refuses two files with the same number.
- Make the file idempotent. It runs again on every save and on top of other open
  features' files, so use `create or replace`, `drop ... if exists`,
  `add column if not exists` and `insert ... on conflict do nothing`.
- Never add or edit files under `@app/db/migrations/committed/`.
- If your file redefines an existing function (`create or replace function`),
  say so in the pull request description and name the function. Two features
  that redefine the same function must be reconciled by hand, because each
  definition replaces the whole body.
- Leave `data/schema.sql` unchanged. It is dumped from committed migrations
  only, so files in `current/` do not appear in it.

CI enforces two of these rules with `scripts/check-migrations.mjs`: it fails
when two files in `current/` share a number, and when a pull request changes
`committed/`.

### Committing migrations (maintainers)

Maintainers commit migrations on `main`, in a pull request that carries the
`migration-commit` label, which lets that pull request change `committed/`. Add
the label before CI runs, or re-run the "Migration files" job after adding it.

```sh
pnpm db commit     # current/ -> committed/NNNNNN.sql, resets current/, re-dumps data/schema.sql
pnpm db migrate    # record the new migration in your development database
```

`pnpm db uncommit` moves the latest committed migration back to `current/`. Use
it only for a migration that has not reached production.

### Regenerating generated files

Regenerate these files with the commands below and commit the result. Do not
edit or hand-merge them. The GraphQL files follow your development database, so
a pull request that changes the GraphQL API regenerates them; `data/schema.sql`
changes only when migrations are committed.

| File                                                                | Command                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `data/schema.sql`                                                   | `pnpm db dump` (`pnpm db commit` runs it; CI fails when it is stale)                     |
| `data/schema.graphql`                                               | `pnpm server schema:export` (also written when the server starts in development)         |
| `@app/graphql/client.json`, `server.json`, `.persisted_operations/` | `pnpm graphql codegen` (reads `data/schema.graphql`; `pnpm graphql build` also compiles) |

CI dumps `data/schema.sql` with the PGDG `pg_dump` 16 client against PostgreSQL
14; other client versions produce a different file. If your default `pg_dump` is
another version, set `PG_DUMP` in `.env` to a matching binary.

## Docker and non-Docker

This project is designed to work both with and without Docker. Please don't
break this!

## Pre-commit hook

`pnpm install` sets up a git pre-commit hook (husky + lint-staged) that runs
`eslint --fix` and `prettier --write` on the files you have staged. Type
checking and tests still run in CI. Skip the hook with `git commit --no-verify`
if you need to.
