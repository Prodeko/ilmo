#!/usr/bin/env node
import inquirer from "inquirer"

import {
  checkGit,
  outro,
  pnpmCmd,
  readDotenv,
  runMain,
  runSync,
  updateDotenv,
  withDotenvUpdater,
} from "./_setup_utils.mjs"

runMain(async () => {
  await checkGit()
  const config = (await readDotenv()) || {}
  const mergeAnswers = (cb) => (answers) => cb({ ...config, ...answers })
  const askStripe = !("PAYMENTS_ENABLED" in config) && !!process.stdin.isTTY
  const questions = [
    {
      type: "input",
      name: "DATABASE_NAME",
      message: "What would you like to call your database?",
      default: "ilmo",
      validate: (name) =>
        /^[a-z][a-z0-9_]+$/.test(name)
          ? true
          : "That doesn't look like a good name for a database, try something simpler - just lowercase alphanumeric and underscores",
      when: !config.DATABASE_NAME,
    },
    {
      type: "input",
      name: "DATABASE_HOST",
      message:
        "What's the hostname of your database server (include :port if it's not the default :5432)?",
      default: "localhost",
      when: !("DATABASE_HOST" in config),
    },
    {
      type: "input",
      name: "ROOT_DATABASE_URL",
      message: mergeAnswers(
        (answers) =>
          `Please enter a superuser connection string to the database server (so we can drop/create the '${answers.DATABASE_NAME}' and '${answers.DATABASE_NAME}_shadow' databases) - IMPORTANT: it must not be a connection to the '${answers.DATABASE_NAME}' database itself, instead try 'template1'.`
      ),
      default: mergeAnswers(
        (answers) =>
          `postgres://${
            answers.DATABASE_HOST === "localhost" ? "" : answers.DATABASE_HOST
          }/template1`
      ),
      when: !config.ROOT_DATABASE_URL,
    },
    {
      type: "input",
      name: "REDIS_URL",
      message:
        "What's the hostname of your redis server (include :port if it's not the default :6379)?",
      default: "redis://127.0.0.1:6379",
      when: !("REDIS_URL" in config),
    },
    // Stripe payments are optional. Asked only once (when .env has no
    // PAYMENTS_ENABLED line yet) and only in an interactive terminal, so CI
    // and re-runs never stop here. See docs/payments.md.
    {
      type: "confirm",
      name: "SETUP_STRIPE_PAYMENTS",
      message:
        "Enable Stripe payments with your own Stripe test-mode keys? (optional, see docs/payments.md; you can add them to .env later)",
      default: false,
      when: askStripe,
    },
    {
      type: "input",
      name: "STRIPE_SECRET_KEY",
      message:
        "Stripe secret key (sk_test_..., from https://dashboard.stripe.com/test/apikeys; leave empty to skip):",
      validate: (key) =>
        !key || /^(sk|rk)_test_\S+$/.test(key)
          ? true
          : "Use a test-mode key starting with sk_test_ (or rk_test_)",
      when: (answers) => askStripe && answers.SETUP_STRIPE_PAYMENTS,
    },
    {
      type: "input",
      name: "STRIPE_WEBHOOK_SECRET",
      message:
        "Stripe webhook signing secret (whsec_..., printed by `stripe listen`; leave empty to skip):",
      validate: (secret) =>
        !secret || /^whsec_\S+$/.test(secret)
          ? true
          : "The signing secret starts with whsec_",
      when: (answers) => askStripe && answers.SETUP_STRIPE_PAYMENTS,
    },
  ]
  const { SETUP_STRIPE_PAYMENTS, ...answers } = await inquirer.prompt(questions)
  if (askStripe) {
    // Payments are on only when the flag and both secrets are set
    answers.PAYMENTS_ENABLED =
      SETUP_STRIPE_PAYMENTS &&
      answers.STRIPE_SECRET_KEY &&
      answers.STRIPE_WEBHOOK_SECRET
        ? "1"
        : ""
  }

  await withDotenvUpdater(answers, (add) =>
    updateDotenv(add, {
      ...config,
      ...answers,
    })
  )

  // And perform setup
  runSync(pnpmCmd, ["--filter", "@app/graphql", "run", "build"])
  runSync(pnpmCmd, ["--filter", "@app/lib", "run", "build"])
  runSync(pnpmCmd, ["--filter", "@app/server", "run", "build"])

  if (process.argv[2] === "auto") {
    // We're advancing automatically
    console.log(`\
✅ Environment file setup success`)
  } else {
    outro(`\
✅ Environment file setup success

🚀 The next step is to set up the database, run:

  ${pnpmCmd} setup:db

If you're not using graphile-migrate, then you should run your preferred migration framework now.  This step should also include creating the necessary schemas and roles.  Consult the generated .env file for what is needed.`)
  }
})
