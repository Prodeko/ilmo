import chalk from "chalk"
import { promises as fsp } from "node:fs"
import nodemailer from "nodemailer"

import { getLocalEmailSettings } from "./localEmail"

const { readFile, writeFile } = fsp

const isTest = process.env.NODE_ENV === "test"
const isDev = process.env.NODE_ENV !== "production"

let transporterPromise: Promise<nodemailer.Transporter>
const etherealFilename = `${process.cwd()}/.ethereal`

let logged = false

export default function getTransport(): Promise<nodemailer.Transporter> {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const localSettings = await getLocalEmailSettings()
      if (!isDev || localSettings?.transport === "sendgrid") {
        const { SENDGRID_API_KEY, SENDGRID_USERNAME } = process.env
        if (!SENDGRID_USERNAME || !SENDGRID_API_KEY) {
          throw new Error("SendGrid credentials are not configured")
        }
        if (localSettings) {
          console.log(
            "Local SendGrid delivery enabled for allowed recipients only."
          )
        }
        return nodemailer.createTransport({
          host: "smtp.sendgrid.net",
          port: 465,
          secure: true,
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 30000,
          auth: { user: SENDGRID_USERNAME, pass: SENDGRID_API_KEY },
        })
      }
      if (isTest) {
        return nodemailer.createTransport({
          jsonTransport: true,
        })
      } else if (isDev) {
        let account
        try {
          const testAccountJson = await readFile(etherealFilename, "utf8")
          account = JSON.parse(testAccountJson)
        } catch (e) {
          account = await nodemailer.createTestAccount()
          await writeFile(etherealFilename, JSON.stringify(account))
        }
        if (!logged) {
          logged = true
          console.log()
          console.log()
          console.log(
            chalk.bold(
              " ✉️ Emails in development are sent via ethereal.email; your credentials follow:"
            )
          )
          console.log("  Site:     https://ethereal.email/login")
          console.log(`  Username: ${account.user}`)
          console.log(`  Password: ${account.pass}`)
          console.log()
          console.log()
        }
        return nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: account.user,
            pass: account.pass,
          },
        })
      }
      throw new Error("Email transport is not configured")
    })()
  }
  return transporterPromise!
}
