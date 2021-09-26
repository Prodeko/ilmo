import { zxcvbn, ZxcvbnOptions } from "@zxcvbn-ts/core"
import zxcvbnCommonPackage from "@zxcvbn-ts/language-common"
import zxcvbnEnPackage from "@zxcvbn-ts/language-en"
import { makeExtendSchemaPlugin } from "graphile-utils"
import { gql } from "postgraphile"

import { OurGraphQLContext } from "../middleware/installPostGraphile"

const options = {
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
}
ZxcvbnOptions.setOptions(options)

const PasswordStrengthPlugin = makeExtendSchemaPlugin(() => {
  return {
    typeDefs: gql`
      type PasswordStrengthFeedback {
        suggestions: [String!]!
      }

      type PasswordStrengthPayload {
        score: Int!
        feedback: PasswordStrengthFeedback!
      }

      extend type Mutation {
        calculatePasswordStrength(password: String!): PasswordStrengthPayload
      }
    `,
    resolvers: {
      Mutation: {
        async calculatePasswordStrength(
          _mutation,
          args,
          _context: OurGraphQLContext,
          _resolveInfo
        ) {
          return zxcvbn(args.password)
        },
      },
    },
  }
})

export default PasswordStrengthPlugin
