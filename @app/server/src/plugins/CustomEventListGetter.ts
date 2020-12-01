import { gql, makeExtendSchemaPlugin } from "graphile-utils";

import { OurGraphQLContext } from "../middleware/installPostGraphile";
import { ERROR_MESSAGE_OVERRIDES } from "../utils/handleErrors";

const CustomEventListGetterPlugin = makeExtendSchemaPlugin((build) => ({
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
      This gets public events
      """
      publicEvents: [PublicEventPayload!]
    }
  `,
  resolvers: {
    Query: {
      async publicEvents(
        _query,
        args,
        context: OurGraphQLContext,
        resolveInfo
      ) {
        const { selectGraphQLResultFromTable } = resolveInfo.graphile;
        const { pgClient } = context;
        try {
          // Call our login function to find out if the username/password combination exists
          const { rows } = await pgClient.query(
            `
            SELECT
              events.id as id,
              events.name as name,
              events.start_time as start_time,
              cats.name as category_name,
              org.name as owner_organization_name,
              is_public
            FROM (
            (
              SELECT *
              FROM app_public.events
              WHERE start_time > NOW()
              ORDER BY start_time ASC
            ) AS events INNER JOIN app_public.event_categories AS cats ON events.category_id = cats.id)
			      INNER JOIN app_public.organizations AS org ON events.owner_organization_id = org.id
            `
          );

          console.log(rows);

          if (!rows) {
            const e = new Error("Fetching events failed");
            e["code"] = "FEEE";
            throw e;
          }

          return rows.map((a) => ({
            id: a.id,
            name: a.name,
            isPublic: a.is_public,
            categoryName: a.category_name,
            startTime: a.start_time,
            ownerOrganizationName: a.owner_organization_name,
          }));
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
