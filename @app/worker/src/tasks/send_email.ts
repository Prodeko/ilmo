import {
  emailFooterText as footerText,
  fromEmail,
  projectName,
} from "@app/config"
import { htmlToText } from "html-to-text"
import mjml2html from "mjml"
import nodemailer from "nodemailer"
import nunjucks from "nunjucks"

import getTransport from "../transport"

import type { Task } from "graphile-worker"

declare module global {
  let TEST_EMAILS: any[]
}

global.TEST_EMAILS = []

const njk = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(`${__dirname}/../../../worker/templates/`)
)

const isTest = process.env.NODE_ENV === "test"
const isDev = process.env.NODE_ENV !== "production"

export interface SendEmailPayload {
  options: {
    from?: string
    to: string | string[]
    subject: string
  }
  template: string
  variables: {
    [varName: string]: any
  }
}

const task: Task = async (inPayload) => {
  const { default: chalk } = await import("chalk")

  const payload: SendEmailPayload = inPayload as any
  const transport = await getTransport()
  const { options: inOptions, template, variables } = payload
  const options = {
    from: fromEmail,
    ...inOptions,
  }
  if (template) {
    const templateFn = await loadTemplate(template)
    const html = await templateFn(variables)
    const html2textableHtml = html.replace(/(<\/?)div/g, "$1p")
    const text = htmlToText(html2textableHtml, {
      wordwrap: 120,
      tags: { img: { format: "skip" } },
    }).replace(/\n\s+\n/g, "\n\n")
    Object.assign(options, { html, text })
  }
  const info = await transport.sendMail(options)
  if (isTest) {
    global.TEST_EMAILS.push(info)
  } else if (isDev) {
    const url = nodemailer.getTestMessageUrl(info)
    if (url) {
      console.log(`Development email preview: ${chalk.blue.underline(url)}`)
    }
  }
}

export default task

const templatePromises = {}
export function loadTemplate(template: string) {
  if (isDev || !templatePromises[template]) {
    templatePromises[template] = (async () => {
      if (!template.match(/^[a-zA-Z0-9_.-]+$/)) {
        throw new Error(`Disallowed template name '${template}'`)
      }
      return (variables: { [varName: string]: any }) => {
        const mjml = njk.render(template, {
          projectName,
          footerText,
          ...variables,
        })

        const { html, errors } = mjml2html(mjml)
        if (errors && errors.length) {
          console.error(errors)
        }
        return html
      }
    })()
  }
  return templatePromises[template]
}
