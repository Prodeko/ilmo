import { gql, makeExtendSchemaPlugin } from "graphile-utils"

import { paymentsEnabled } from "../utils/stripe"

const PaymentsPlugin = makeExtendSchemaPlugin(() => ({
  typeDefs: gql`
    extend type Query {
      """
      True when Stripe payments are configured on this server. While false,
      every event behaves as if its payment mode were NONE.
      """
      paymentsEnabled: Boolean!
    }
  `,
  resolvers: {
    Query: {
      paymentsEnabled() {
        return paymentsEnabled()
      },
    },
  },
}))

export default PaymentsPlugin
