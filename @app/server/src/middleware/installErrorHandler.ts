import { FastifyError, FastifyPluginAsync } from "fastify"
import fp from "fastify-plugin"
import { template, TemplateExecutor } from "lodash"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const isDev = process.env.NODE_ENV === "development"

interface ParsedError {
  message: string
  status: number
  extensions?: { code?: string }
}

function parseError(error: FastifyError): ParsedError {
  /*
   * Because an error may contain confidential information or information that
   * might help attackers, by default we don't output the error message at all.
   * You should override this for specific classes of errors below.
   */

  // TODO: process certain errors
  const code = error["statusCode"] || error["status"] || error["code"]
  const codeAsFloat = parseInt(code, 10)
  const httpCode =
    isFinite(codeAsFloat) && codeAsFloat >= 400 && codeAsFloat < 600
      ? codeAsFloat
      : 500

  return {
    message: "An unknown error occurred",
    status: httpCode,
  }
}

let errorPageTemplate: TemplateExecutor
function _getErrorPage({ message }: ParsedError) {
  if (!errorPageTemplate || isDev) {
    errorPageTemplate = template(
      readFileSync(resolve(__dirname, "../../error.html"), "utf8")
    )
  }

  return errorPageTemplate({
    message: message
      ? String(message)
      : "Something went wrong on the webpage you visited, please try again later",
  })
}

const ErrorHandler: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _req, res) => {
    console.error(error)

    const parsedError = parseError(error)
    const errorMessageString = `ERROR: ${parsedError.message}`

    if (res.sent) {
      console.error(errorMessageString)
      return
    }

    res.status(parsedError.status)
    res.header("Content-Type", "application/json; charset=utf-8").send({
      errors: [
        {
          message: errorMessageString,
          extensions: { ...parsedError.extensions },
        },
      ],
    })
  })
}

export default fp(ErrorHandler)
