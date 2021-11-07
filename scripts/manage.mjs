#!/usr/bin/env node

import path from "path"

import chalkPipe from "chalk-pipe"
import dotenv from "dotenv"
import inquirer from "inquirer"
import pg from "pg"

const DEFAULT_AVATAR_URL =
  "https://static.prodeko.org/media/public/2020/07/07/anonymous_prodeko.jpg"

function dirname(meta) {
  return new URL(".", meta.url).pathname
}

const __dirname = dirname(import.meta)
const isProd = process.env.NODE_ENV === "production"

const manageActions = {
  type: "list",
  name: "action",
  message: "Please select an action from the list below",
  choices: ["Create a user"],
}

let pgPool, client

async function setupDb() {
  if (!isProd) {
    dotenv.config({ path: `${__dirname}/../.env` })
    await import(path.resolve(`${__dirname}/../@app/config/extra.js`))
  }
  pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  })
  pgPool.on("error", (err) => {
    console.log(
      "An error occurred whilst trying to talk to the database: " + err.message
    )
  })
  client = await pgPool.connect()
}

function main() {
  console.log("Ilmo management CLI")
  setupDb()
  manage()
}

function manage() {
  inquirer.prompt(manageActions).then(({ action }) => {
    if (action === "Create a user") {
      createUser()
    }
  })
}

function createUser() {
  inquirer
    .prompt([
      {
        type: "input",
        name: "firstname",
        message: "Please enter the firstname of the user",
        validate: (name) => {
          if (!name.match(/^[a-zA-Z]+$/)) {
            console.log(
              chalkPipe("red.bold")(
                " Your name must not contain spaces, numbers or special characters"
              )
            )
            return false
          }
          return true
        },
      },
      {
        type: "input",
        name: "lastname",
        message: "Please enter the lastname of the user",
        validate: (name) => {
          if (!name.match(/^[a-zA-Z]+$/)) {
            console.log(
              chalkPipe("red.bold")(
                " Your name must not contain spaces, numbers or special characters"
              )
            )
            return false
          }
          return true
        },
      },
      {
        type: "input",
        name: "username",
        message: "Please enter the username of the user",
        validate: (name) => {
          if (name.length < 2 || name.length > 24) {
            console.log(
              chalkPipe("red.bold")(
                " Username must be between 3 and 24 characters long"
              )
            )
            return false
          } else if (!name.match(/^[a-zA-Z]([_]?[a-zA-Z0-9])+$/)) {
            console.log(
              chalkPipe("red.bold")(
                " Username must only contain alphanumeric characters"
              )
            )
            return false
          }
          return true
        },
      },
      {
        type: "input",
        name: "email",
        message: "Please enter the email address of the user",
        default: () => {},
        validate: (email) => {
          const valid = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(
            email
          )
          if (valid) {
            return true
          } else {
            console.log(chalkPipe("red.bold")(" Please enter a valid email"))
            return false
          }
        },
      },
      {
        type: "input",
        name: "password",
        message: "Please enter the password of the user",
      },
      {
        type: "confirm",
        name: "isAdmin",
        message: "Make this user an admin?",
      },
    ])
    .then(
      async ({ username, firstname, lastname, email, password, isAdmin }) => {
        const name = `${firstname} ${lastname}`
        const avatarUrl = DEFAULT_AVATAR_URL

        const emailIsVerified = true
        await client.query(
          `select app_private.really_create_user($1, $2, $3, $4, $5, $6, $7)`,
          [username, email, name, avatarUrl, password, emailIsVerified, isAdmin]
        )
        console.log(`Succesfully created admin user.`)
      }
    )
}
main()
