import { emailLegalText as legalText, projectName } from "@app/config"
import mjml2html from "mjml"
import nunjucks from "nunjucks"

const isDev = process.env.NODE_ENV !== "production"

const njk = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(`${__dirname}/../../../worker/templates/`)
)

// TODO: Code duplication with @app/worker/src/send_email.ts
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
          legalText,
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
