import * as fs from "fs";
import { resolve } from "path";

import { FastifyError, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { template, TemplateExecutor } from "lodash";

const isDev = process.env.NODE_ENV === "development";

interface ParsedError {
  message: string;
  status: number;
  code?: string;
}

function parseError(error: FastifyError): ParsedError {
  /*
   * Because an error may contain confidential information or information that
   * might help attackers, by default we don't output the error message at all.
   * You should override this for specific classes of errors below.
   */

  if (error["code"] === "EBADCSRFTOKEN") {
    return {
      message: "Invalid CSRF token: please reload the page.",
      status: 403,
      code: error["code"],
    };
  }

  // TODO: process certain errors
  const code = error["statusCode"] || error["status"] || error["code"];
  const codeAsFloat = parseInt(code, 10);
  const httpCode =
    isFinite(codeAsFloat) && codeAsFloat >= 400 && codeAsFloat < 600
      ? codeAsFloat
      : 500;

  return {
    message: "An unknown error occurred",
    status: httpCode,
  };
}

let errorPageTemplate: TemplateExecutor;
function _getErrorPage({ message }: ParsedError) {
  if (!errorPageTemplate || isDev) {
    errorPageTemplate = template(
      fs.readFileSync(resolve(__dirname, "../../error.html"), "utf8")
    );
  }

  return errorPageTemplate({
    message: message
      ? String(message)
      : "Something went wrong on the webpage you visited, please try again later",
  });
}

const ErrorHandler: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _req, res): void => {
    const parsedError = parseError(error);
    const errorMessageString = `ERROR: ${parsedError.message}`;

    if (res.sent) {
      console.error(errorMessageString);
      return;
    }

    res.status(parsedError.status);
    res.header("Content-Type", "application/json; charset=utf-8").send({
      errors: [{ message: errorMessageString, code: parsedError.code }],
    });
  });
};

export default fp(ErrorHandler);
