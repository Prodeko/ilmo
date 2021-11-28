import { URLSearchParams } from "url"

import got from "got"
import { makeExtendSchemaPlugin } from "graphile-utils"
import { gql } from "postgraphile"
import sanitizeHtml from "sanitize-html"
import { v4 as uuidv4 } from "uuid"

import { OurGraphQLContext } from "../middleware/installPostGraphile"

const { AZURE_TRANSLATE_API_URL, AZURE_TRANSLATE_SUBSCRIPTION_KEY } =
  process.env

if (!AZURE_TRANSLATE_API_URL) {
  throw new Error("AZURE_TRANSLATE_API_URL envvar is not set")
}
if (!AZURE_TRANSLATE_SUBSCRIPTION_KEY) {
  throw new Error("AZURE_TRANSLATE_SUBSCRIPTION_KEY envvar is not set")
}

// See https://docs.microsoft.com/en-us/azure/cognitive-services/translator/reference/v3-0-translate
// for translate API response documentation
type Translation = {
  to: string
  from: string
}

type TranslateResponse = {
  translations: Translation[]
}

// Should match whatever HTMl tags SlateSupportedTypes and
// SlateFormatOptions use. See @app/components/Editos/utils.ts
// serialize function to see what tags are being used
export const TRANSLATE_ALLOWED_TAGS = [
  "blockquote",
  "code",
  "h1",
  "h2",
  "ul",
  "li",
  "ol",
  "p",
  "strong",
  "i",
  "u",
  "code",
] as const

const TranslatePlugin = makeExtendSchemaPlugin(() => {
  return {
    typeDefs: gql`
      type TranslateTextPayload {
        originalText: String!
        translatedText: String!
      }

      extend type Mutation {
        translateText(
          text: String!
          fromLanguage: SupportedLanguages!
          toLanguage: SupportedLanguages!
        ): TranslateTextPayload!
      }
    `,
    resolvers: {
      Mutation: {
        async translateText(
          _mutation,
          args,
          _context: OurGraphQLContext,
          _resolveInfo
        ) {
          const { text: originalText, fromLanguage, toLanguage } = args

          try {
            const headers = {
              "Ocp-Apim-Subscription-Key": AZURE_TRANSLATE_SUBSCRIPTION_KEY,
              "Ocp-Apim-Subscription-Region": "westeurope",
              "Content-type": "application/json",
              "X-ClientTraceId": uuidv4().toString(),
            }
            const body = JSON.stringify([
              {
                Text: originalText,
              },
            ])
            const translateResponse = await got
              .post<TranslateResponse>(
                `${AZURE_TRANSLATE_API_URL}?` +
                  new URLSearchParams({
                    "api-version": "3.0",
                    textType: "html",
                    from: fromLanguage.toLowerCase(),
                    to: toLanguage.toLowerCase(),
                  }),
                {
                  responseType: "json",
                  headers,
                  body,
                }
              )
              .json()

            // @ts-ignore
            const [{ translations }] = translateResponse
            const [{ text: translatedText }] = translations
            const sanitizedTranslatedText = sanitizeHtml(translatedText, {
              allowedTags: TRANSLATE_ALLOWED_TAGS,
            })
            return { originalText, translatedText: sanitizedTranslatedText }
          } catch (e) {
            const message = e.response.body?.error?.message
            if (message) {
              throw new Error(message)
            }
            throw e
          }
        },
      },
    },
  }
})

export default TranslatePlugin
