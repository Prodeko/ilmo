import { makeExtendSchemaPlugin } from "graphile-utils"
import { gql } from "postgraphile"

// Read runtime configuration: container builds do not have the bot secret.
export default makeExtendSchemaPlugin(() => ({
  typeDefs: gql`
    extend type Query {
      telegramBotUsername: String
    }
  `,
  resolvers: {
    Query: {
      telegramBotUsername: () =>
        process.env.TELEGRAM_BOT_TOKEN
          ? process.env.TELEGRAM_BOT_USERNAME || "IlmoReminderBot"
          : null,
    },
  },
}))
