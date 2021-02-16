import fs from "fs";
import path from "path";

import { gql, makeExtendSchemaPlugin } from "graphile-utils";
import * as html2text from "html-to-text";

import { OurGraphQLContext } from "../middleware/installPostGraphile";
import { loadTemplate } from "../utils/emailUtils";
import { ERROR_MESSAGE_OVERRIDES } from "../utils/handleErrors";

const { ROOT_URL } = process.env;
const EMAIL_SEND_TEMPLATE_WHITELIST = ["event_registration.mjml.njk"];

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
      registrationName: String
      registrationQuota: TranslatedInputField
      eventName: TranslatedInputField
      eventTime: String
      eventLink: String
      eventRegistrationDeleteLink: String
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
    type RenderEmailPayload {
      name: String
      html: String
      text: String
    }

    """
    The output of our \`renderEmailTemplates\` query.
    """
    type EmailTemplatesConnection {
      templates: [RenderEmailPayload!]!
    }

    extend type Query {
      """
      Use this query to render server-side mjml templates to html and text.
      """
      renderEmailTemplate(input: RenderEmailInput!): RenderEmailPayload

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
        const { template, variables } = args.input;

        try {
          if (!EMAIL_SEND_TEMPLATE_WHITELIST.includes(template)) {
            const e = new Error("Unallowed email template.");
            e["code"] = "DNIED";
            throw e;
          }

          const templateFn = await loadTemplate(template);
          const html = await templateFn(variables);
          const html2textableHtml = html.replace(/(<\/?)div/g, "$1p");
          const text = html2text.fromString(html2textableHtml, {
            wordwrap: 120,
            tags: { img: { format: "skip" } },
          });

          return {
            html,
            text,
          };
        } catch (e) {
          const { code } = e;
          const safeErrorCodes = [
            "DNIED",
            ...Object.keys(ERROR_MESSAGE_OVERRIDES),
          ];
          if (safeErrorCodes.includes(code)) {
            throw e;
          } else {
            console.error(
              "Unrecognised error in EmailsPlugin > renderEmailTemplate; replacing with sanitized version"
            );
            console.error(e);
            const error = new Error("Rendering email failed.");
            error["code"] = code;
            throw error;
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
          );

          const templateFiles = fs.readdirSync(templatesFolder);
          const ret = templateFiles.map(async (filename) => {
            // Dummy variables for mjml templates
            const variables = {
              registrationQuota: { fi: "N", en: "N" },
              registrationName: "Teppo Testinen",
              eventName: { fi: "Testitapahtuma", en: "Test event" },
              eventTime: "2021-01-01 12:00 - 2021-01-01 15:00",
              eventLink: `${ROOT_URL}/event/2021-01-01-testitapahtuma`,
              eventRegistrationDeleteLink: "",
              actionDescription: "You changed your password.",
              deleteAccountLink: "",
              contentFinnish:
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse eget tellus eros.",
              contentEnglish:
                "Morbi semper posuere placerat. Fusce lectus ex, egestas eget nunc placerat, placerat condimentum eros.",
              organizationName: "Webbitiimi",
              link: "",
              verifyLink: "",
              token: "12345",
              url: ROOT_URL,
            };
            const templateFn = await loadTemplate(filename);
            const html = await templateFn(variables);
            const html2textableHtml = html.replace(/(<\/?)div/g, "$1p");
            const text = html2text
              .fromString(html2textableHtml, {
                wordwrap: 120,
                tags: { img: { format: "skip" } },
              })
              .replace(/\n\s+\n/g, "\n\n");

            // All templates end in .mjml.njk, remove the file extension
            const name = filename.slice(0, -9).replace(/_/g, " ");

            return {
              name,
              html,
              text,
            };
          });
          return { templates: ret };
        } catch (e) {
          const { code } = e;
          console.error(
            "Unrecognised error in EmailsPlugin > renderEmailTemplates; replacing with sanitized version"
          );
          console.error(e);
          const error = new Error("Rendering email templates failed");
          error["code"] = code;
          throw error;
        }
      },
    },
  },
}));

export default EmailsPlugin;
