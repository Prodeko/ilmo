# Contributing

We welcome contributions; but please don't expand the scope of the project
without first discussing it with the maintainers (by opening an issue).

## Migrations

This project will only ever have one migration; we do not need to cater to
backwards compatibility, prefering simplicity for new users.

If you wish to change the database, run

```
yarn db uncommit
```

to move the migration back to `current.sql`; then make your changes, and when
you're happy run:

```
yarn db commit
```

and commit your changes.

## Docker and non-Docker

This project is designed to work both with and without Docker. Please don't
break this!

## Pre-commit hook

`pnpm install` sets up a git pre-commit hook (husky + lint-staged) that runs
`eslint --fix` and `prettier --write` on the files you have staged. Type
checking and tests still run in CI. Skip the hook with `git commit --no-verify`
if you need to.
