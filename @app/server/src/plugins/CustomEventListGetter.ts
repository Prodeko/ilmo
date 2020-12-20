import { gql, makeExtendSchemaPlugin } from "graphile-utils";

import { OurGraphQLContext } from "../middleware/installPostGraphile";
import { ERROR_MESSAGE_OVERRIDES } from "../utils/handleErrors";

const CustomEventListGetterPlugin = makeExtendSchemaPlugin(() => ({
  typeDefs: gql`
    type PublicEventPayload {
      id: UUID!
      name: String
      startTime: Datetime!
      ownerOrganizationName: String!
      categoryName: String!
      isPublic: Boolean!
    }

    extend type Query {
      """
      Get public events
      """
      publicEvents: [PublicEventPayload!]
    }
  `,
  resolvers: {
    Query: {
      async publicEvents(
        _query,
        _args,
        context: OurGraphQLContext,
        _resolveInfo
      ) {
        const { pgClient } = context;

        try {
          // Call our login function to find out if the username/password combination exists
          const { rows } = await pgClient.query(
            `
              select
                event.id as id,
                event.name as name,
                event.start_time as "startTime",
                category.name as "categoryName",
                category.is_public as "isPublic",
                org.name as "ownerOrganizationName"
              from (
              (
                select *
                from app_public.events
                where start_time > now()
                order by start_time asc
              ) as event inner join app_public.event_categories as category on event.category_id = category.id)
              inner join app_public.organizations as org on event.owner_organization_id = org.id
            `
          );

          const { rows: rows2 } = await pgClient.query(
            "select app_public.current_session_id()"
          );

          console.log(rows2, rows);

          if (!rows) {
            console.log("here");
            const e = new Error("Fetching events failed");
            e["code"] = "NTFND";
            throw e;
          }

          return rows;
        } catch (e) {
          const { code } = e;
          const safeErrorCodes = [...Object.keys(ERROR_MESSAGE_OVERRIDES)];
          if (safeErrorCodes.includes(code)) {
            throw e;
          } else {
            console.error(
              "Unrecognised error in CustomEventListGetter; replacing with sanitized version"
            );
            console.error(e);
            const error = new Error("Fetching events failed");
            error["code"] = code;
            throw error;
          }
        }
      },
    },
  },
}));

export default CustomEventListGetterPlugin;
