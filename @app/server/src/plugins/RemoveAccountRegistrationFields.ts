import omit from "lodash/omit"
import { Plugin } from "postgraphile"

/**
 * This plugin removes mutations related to account registration from
 * the GraphQL schema if process.env.ENABLE_REGISTRATION=0.
 */
const RemoveAccountRegistrationFields: Plugin = function (builder) {
  builder.hook("GraphQLObjectType:fields", (fields, _, context) => {
    const { Self } = context
    if (process.env.ENABLE_REGISTRATION === "0") {
      // Omit these mutations when ENABLE_REGISTRATION = "0"
      // forgotPassword and resetPassword are not included here, since
      // there exists functionality to assign a passphrase to an
      // account that was registered via oauth.
      const mutationsToOmit = ["register"]
      if (Self.name !== "Mutation") {
        return fields
      }
      return omit(fields, mutationsToOmit)
    }
    return fields
  })
}

export default RemoveAccountRegistrationFields
