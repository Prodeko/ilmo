import { FastifyPluginAsync } from "fastify"
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

function isErrorLike(error: unknown): error is {
  message?: string
  statusCode?: unknown
  status?: unknown
  code?: unknown
} {
  return typeof error === "object" && error !== null
}

function toFiniteHttpStatus(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? parseInt(value, 10)
      : NaN
  return isFinite(parsed) && parsed >= 400 && parsed < 600 ? parsed : undefined
}

function parseError(error: unknown): ParsedError {
  /*
   * Because an error may contain confidential information or information that
   * might help attackers, by default we don't output the error message at all.
   * You should override this for specific classes of errors below.
   */

  if (!isErrorLike(error)) {
    return { message: "An unknown error occurred", status: 500 }
  }

  if (error.message?.includes("csrf")) {
    return {
      message: "Invalid CSRF token: please reload the page.",
      status: 403,
    }
  }

  // TODO: process certain errors
  const httpCode =
    toFiniteHttpStatus(error.statusCode) ??
    toFiniteHttpStatus(error.status) ??
    toFiniteHttpStatus(error.code) ??
    500

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
