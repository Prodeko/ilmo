import { promises as fsp } from "fs";

import { emailLegalText as legalText, projectName } from "@app/config";
import { template as lodashTemplate } from "lodash";
import mjml2html from "mjml";

const { readFile } = fsp;

const isDev = process.env.NODE_ENV !== "production";

// TODO: Code duplication with @app/worker/src/send_email.ts
const templatePromises = {};
export function loadTemplate(template: string) {
  if (isDev || !templatePromises[template]) {
    templatePromises[template] = (async () => {
      if (!template.match(/^[a-zA-Z0-9_.-]+$/)) {
        throw new Error(`Disallowed template name '${template}'`);
      }
      const templateString = await readFile(
        `${__dirname}/../../../worker/templates/${template}`,
        "utf8"
      );
      const templateFn = lodashTemplate(templateString, {
        escape: /\[\[([\s\S]+?)\]\]/g,
      });
      return (variables: { [varName: string]: any }) => {
        // Use | in template variable to insert a line break
        // See an example in @app/client/src/pages/create-event/index.ts
        const mjml = templateFn({
          projectName,
          legalText,
          ...variables,
        }).replace(/\|/g, "<br/>");

        const { html, errors } = mjml2html(mjml);
        if (errors && errors.length) {
          console.error(errors);
        }
        return html;
      };
    })();
  }
  return templatePromises[template];
}
