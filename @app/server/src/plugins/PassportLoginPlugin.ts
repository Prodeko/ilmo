import { gql, makeExtendSchemaPlugin } from "graphile-utils"

import { buildKeycloakLogoutUrl } from "../middleware/installKeycloak"
import { OurGraphQLContext } from "../middleware/installPostGraphile"
import { keycloakEnabled } from "../utils/keycloak"

const PassportLoginPlugin = makeExtendSchemaPlugin((build) => ({
  typeDefs: gql`
    input LoginInput {
      username: String!
      password: String!
    }

    type LoginPayload {
      user: User! @pgField
    }

    type LogoutPayload {
      success: Boolean
      redirectTo: String
    }

    """
    All input for the \`resetPassword\` mutation.
    """
    input ResetPasswordInput {
      """
      An arbitrary string value with no semantic meaning. Will be included in the
      payload verbatim. May be used to track mutations by the client.
      """
      clientMutationId: String

      userId: UUID!
      resetToken: String!
      newPassword: String!
    }

    """
    The output of our \`resetPassword\` mutation.
    """
    type ResetPasswordPayload {
      """
      The exact same \`clientMutationId\` that was provided in the mutation input,
      unchanged and unused. May be used by a client to track mutations.
      """
      clientMutationId: String

      """
      Our root query field type. Allows us to run any query from our mutation payload.
      """
      query: Query

      success: Boolean
    }

    extend type Query {
      """
      True when Keycloak SSO login is configured on this server.
      """
      ssoLoginEnabled: Boolean!
    }

    extend type Mutation {
      """
      Use this mutation to log in to your account; this login uses sessions so you do not need to take further action.
      """
      login(input: LoginInput!): LoginPayload

      """
      Use this mutation to logout from your account. Don't forget to clear the client state!
      """
      logout: LogoutPayload

      """
      After triggering forgotPassword, you'll be sent a reset token. Combine this with your user ID and a new password to reset your password.
      """
      resetPassword(input: ResetPasswordInput!): ResetPasswordPayload
    }
  `,
  resolvers: {
    Query: {
      ssoLoginEnabled() {
        return keycloakEnabled()
      },
    },
    Mutation: {
      async login(_mutation, args, context: OurGraphQLContext, resolveInfo) {
        const { selectGraphQLResultFromTable } = resolveInfo.graphile
        const { username, password } = args.input
        const { rootPgPool, login, pgClient } = context
        try {
          // Call our login function to find out if the username/password combination exists
          const {
            rows: [session],
          } = await rootPgPool.query(
            `select sessions.* from app_private.login($1, $2) sessions where not (sessions is null)`,
            [username, password]
          )

          if (!session) {
            const error = new Error("Incorrect username/password")
            error["code"] = "CREDS"
            throw error
          }

          if (session.uuid) {
            // Tell Passport.js we're logged in
            await login({ sessionId: session.uuid })
          }

          // Get session_id from PG
          await pgClient.query(
            `select set_config('jwt.claims.session_id', $1, true)`,
            [session.uuid]
          )

          // Fetch the data that was requested from GraphQL, and return it
          const sql = build.pgSql
          const [row] = await selectGraphQLResultFromTable(
            sql.fragment`app_public.users`,
            (tableAlias, sqlBuilder) => {
              sqlBuilder.where(
                sql.fragment`${tableAlias}.id = app_public.current_user_id()`
              )
            }
          )
          return {
            data: row,
          }
        } catch (e) {
          const { code } = e
          const safeErrorCodes = ["LOCKD", "CREDS"]
          if (safeErrorCodes.includes(code)) {
            throw e
          } else {
            console.error(e)
            const error = new Error("Login failed")
            error["code"] = e.code
            throw error
          }
        }
      },

      async logout(_mutation, _args, context: OurGraphQLContext, _resolveInfo) {
        const { pgClient, logout, rootPgPool, isSsoSession } = context
        let redirectTo: string | null = null
        if (isSsoSession()) {
          // The ID token has to be read while the session still resolves to a
          // user; app_public.logout() clears the transaction's session claim.
          const {
            rows: [row],
          } = await pgClient.query(
            "select app_public.current_user_id() as user_id"
          )
          if (row?.user_id) {
            redirectTo = await buildKeycloakLogoutUrl(rootPgPool, row.user_id)
          }
        }
        await pgClient.query("select app_public.logout();")
        await logout()
        return { success: true, redirectTo }
      },

      async resetPassword(
        _mutation,
        args,
        context: OurGraphQLContext,
        _resolveInfo
      ) {
        const { rootPgPool } = context
        const { userId, resetToken, newPassword, clientMutationId } = args.input

        // Since the `reset_password` function needs to keep track of attempts
        // for security, we cannot risk the transaction being rolled back by a
        // later error. As such, we don't allow users to call this function
        // through normal means, instead calling it through our root pool
        // without a transaction.
        const {
          rows: [row],
        } = await rootPgPool.query(
          `select app_private.reset_password($1, $2, $3) as success`,
          [userId, resetToken, newPassword]
        )

        return {
          clientMutationId,
          success: row?.success,
        }
      },
    },
  },
}))

export default PassportLoginPlugin
