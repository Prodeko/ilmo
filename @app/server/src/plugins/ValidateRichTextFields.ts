import { SupportedLanguages } from "@app/graphql"
import { SlateSupportedTypes } from "@app/lib"
import Ajv, { JSONSchemaType } from "ajv"
import betterAjvErrors from "better-ajv-errors"
import { makeWrapResolversPlugin } from "graphile-utils"
import get from "lodash/get"

import { OurGraphQLContext } from "../middleware/installPostGraphile"

import type { Languages, SlateCustomElement } from "@app/lib"

const ajv = new Ajv()

type RichTextFieldType = {
  [key in Languages]: Array<SlateCustomElement> | null
}

// TODO: ajv complains in tests about strictNullChecks: false
// @ts-ignore
const elementSchema: JSONSchemaType<Array<SlateCustomElement>> = {
  type: "array",
  items: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: Object.values(SlateSupportedTypes),
      },
      children: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            code: { type: "boolean", nullable: true },
            bold: { type: "boolean", nullable: true },
            italic: { type: "boolean", nullable: true },
            underline: { type: "boolean", nullable: true },
          },
          required: ["text"],
          additionalProperties: false,
        },
      },
    },
    required: ["type", "children"],
    additionalProperties: false,
  },
}

const props = Object.values(SupportedLanguages).reduce((acc, lang) => {
  acc[lang.toLowerCase()] = elementSchema
  return acc
}, {} as { [key in Languages]: typeof elementSchema })

// TODO: ajv complains in tests about strictNullChecks: false
// @ts-ignore
const schema: JSONSchemaType<RichTextFieldType> = {
  type: "object",
  properties: {
    ...props,
  },
  additionalProperties: false,
  anyOf: [
    { required: ["fi"] },
    { required: ["en"] },
    { required: ["sv"] },
    { required: ["fi", "sv"] },
    { required: ["fi", "en"] },
    { required: ["en", "sv"] },
    { required: ["fi", "sv", "en"] },
  ],
  required: [],
}

const validate = ajv.compile(schema)

function isValidData(fieldName: string, data) {
  if (!validate(data)) {
    const [{ error, suggestion }] = betterAjvErrors(
      schema,
      data,
      // TODO: Fix when betterAjvErrors are correct
      // @ts-ignore
      validate.errors,
      {
        format: "js",
      }
    )
    throw new Error(
      `Error validating field '${fieldName}': ${error}. ${
        suggestion ? suggestion : ""
      }`
    )
  }
}

function validateRichTextField(fieldName: string) {
  return async (
    resolve,
    _source,
    args,
    _context: OurGraphQLContext,
    _resolveInfo
  ) => {
    const data = get(args.input, fieldName)
    try {
      isValidData(fieldName, data)
    } catch (errors) {
      return errors
    }
    return resolve()
  }
}

const EventRegistrationPlugin = makeWrapResolversPlugin({
  Mutation: {
    createEvent: validateRichTextField("event.description"),
    updateEvent: validateRichTextField("event.description"),
  },
})

export default EventRegistrationPlugin
