import { gql, makeExtendSchemaPlugin } from "graphile-utils"
import html2text from "html-to-text"
import fs from "node:fs"
import path from "node:path"

import { OurGraphQLContext } from "../middleware/installPostGraphile"
import { loadTemplate } from "../utils/emailUtils"
import { ERROR_MESSAGE_OVERRIDES } from "../utils/handleErrors"

const EMAIL_SEND_TEMPLATE_ALLOWLIST = ["event_registration.mjml.njk"]

const EmailsPlugin = makeExtendSchemaPlugin(() => ({
  typeDefs: gql`
    """
    An input type for translated fields.
    """
    input TranslatedInputField {
      fi: String
      en: String
    }

    input EmailTemplateVariables {
      actionDescription: String
      deleteAccountLink: String
      eventName: TranslatedInputField
      eventRegistrationUpdateLink: String
      eventSlug: String
      eventTime: String
      eventLocation: String
      link: String
      organizationName: String
      registrationQuota: TranslatedInputField
      registrationName: String
      token: String
      url: String
      verifyLink: String
    }

    """
    All input for the \`renderEmail\` mutation.
    """
    input RenderEmailInput {
      template: String!
      variables: EmailTemplateVariables
    }

    """
    The output of our \`renderEmailTemplate\` query.
    """
    type EmailTemplate {
      id: String!
      name: String!
      html: String!
      text: String!
    }

    """
    Reads through a set of \`EmailTemplate\`.
    """
    type EmailTemplatesConnection {
      templates: [EmailTemplate!]!
    }

    extend type Query {
      """
      Use this query to render server-side mjml templates to html and text.
      """
      renderEmailTemplate(input: RenderEmailInput!): EmailTemplate

      """
      Use this query to render all server-side email templates to html and text.
      """
      renderEmailTemplates: EmailTemplatesConnection
    }
  `,
  resolvers: {
    Query: {
      async renderEmailTemplate(
        _mutation,
        args,
        _context: OurGraphQLContext,
        _resolveInfo
      ) {
        const { template, variables } = args.input

        try {
          if (!EMAIL_SEND_TEMPLATE_ALLOWLIST.includes(template)) {
            const e = new Error("Unallowed email template.")
            e["code"] = "DNIED"
            throw e
          }

          const templateFn = await loadTemplate(template)
          const html = await templateFn({
            ...variables,
            url: process.env.ROOT_URL,
          })
          const html2textableHtml = html.replace(/(<\/?)div/g, "$1p")
          const text = html2text.fromString(html2textableHtml, {
            wordwrap: 120,
            tags: { img: { format: "skip" } },
          })
          // All templates end in .mjml.njk, remove the file extension
          const name = template.slice(0, -9).replace(/_/g, " ")

          return {
            id: name,
            name: name,
            html,
            text,
          }
        } catch (e) {
          const { code } = e
          const safeErrorCodes = [
            "DNIED",
            ...Object.keys(ERROR_MESSAGE_OVERRIDES),
          ]
          if (safeErrorCodes.includes(code)) {
            throw e
          } else {
            console.error(
              "Unrecognised error in EmailsPlugin > renderEmailTemplate; replacing with sanitized version"
            )
            console.error(e)
            const error = new Error("Rendering email failed.")
            error["code"] = code
            throw error
          }
        }
      },
      async renderEmailTemplates(
        _mutation,
        _args,
        _context: OurGraphQLContext,
        _resolveInfo
      ) {
        try {
          const templatesFolder = path.resolve(
            __dirname,
            "../../../worker/templates/"
          )

          const templateFiles = fs.readdirSync(templatesFolder)
          const ret = templateFiles.map(async (filename) => {
            // Dummy variables for mjml templates
            const variables = {
              actionDescription: "You changed your password.",
              deleteAccountLink: "",
              eventName: { fi: "Testitapahtuma", en: "Test event" },
              eventSlug: "2021-01-01-testitapahtuma",
              eventTime: "2021-01-01 12:00 - 2021-01-01 15:00",
              eventLocation: "Testilokaatio",
              eventRegistrationUpdateLink: "",
              link: "",
              organizationName: "Webbitiimi",
              registrationQuota: { fi: "N", en: "N" },
              registrationName: "Teppo Testinen",
              token: "12345",
              url: process.env.ROOT_URL,
              verifyLink: "",
            }
            const templateFn = await loadTemplate(filename)
            const html = await templateFn(variables)
            const html2textableHtml = html.replace(/(<\/?)div/g, "$1p")
            const text = html2text
              .fromString(html2textableHtml, {
                wordwrap: 120,
                tags: { img: { format: "skip" } },
              })
              .replace(/\n\s+\n/g, "\n\n")

            // All templates end in .mjml.njk, remove the file extension
            const name = filename.slice(0, -9).replace(/_/g, " ")

            return {
              id: name,
              name,
              html,
              text,
            }
          })
          return { templates: ret }
        } catch (e) {
          const { code } = e
          console.error(
            "Unrecognised error in EmailsPlugin > renderEmailTemplates; replacing with sanitized version"
          )
          console.error(e)
          const error = new Error("Rendering email templates failed")
          error["code"] = code
          throw error
        }
      },
    },
  },
}))

export default EmailsPlugin
