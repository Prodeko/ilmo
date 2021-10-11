# @app/config

This package contains shared configuration between the entire project.

## Configuration settings

In [src/index.ts](src/index.ts) you'll find some settings that are used in
various places in the app, for example:

- `fromEmail` - the email address to send emails from.
- `projectName` - sourced from `package.json`; the name of your project!
- `orgName` - for copyright ownership.
- `emailFooterText` - footer text to put at the bottom of emails. Since all
  emails in this project are transactional, an `unsubscribe` link is not needed

## Environmental variables

In order to support multiplatform and docker development in the same repository,
we use `node -r @app/config/env path/to/code` to run various parts of the
project. `node -r` requires a specific module before running the main script; in
this case we're requiring [@app/config/env.js](./env.js) which sources the
settings from `.env` in the root folder and then builds some derivative
environmental variables from them. This is a fairly advanced technique.
