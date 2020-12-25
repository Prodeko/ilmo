import { asRoot } from "../../../__tests__/helpers";
import {
  createEventDataAndLogin,
  deleteTestData,
  runGraphQLQuery,
  sanitize,
  setup,
  teardown,
} from "../helpers";

beforeEach(deleteTestData);
beforeAll(setup);
afterAll(teardown);

test("ClaimRegistrationToken", async () => {
  const { session, event } = await createEventDataAndLogin();
  await runGraphQLQuery(
    // GraphQL query goes here:
    `mutation ClaimRegistrationToken($eventId: UUID!) {
        claimRegistrationToken(input: { eventId: $eventId }) {
          registrationToken {
            eventId
            token
          }
        }
      }
      `,

    // GraphQL variables:
    {
      eventId: event.id,
    },

    // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
    {
      user: { session_id: session.uuid },
    },

    // This function runs all your test assertions:
    async (json, { pgClient }) => {
      expect(json.errors).toBeFalsy();
      expect(json.data).toBeTruthy();

      const registrationToken = json.data!.claimRegistrationToken
        .registrationToken;

      expect(registrationToken).toBeTruthy();
      expect(registrationToken).toBeTruthy();
      expect(registrationToken.token).toBeTruthy();
      expect(registrationToken.eventId).toBeTruthy();

      expect(sanitize(registrationToken)).toMatchInlineSnapshot(`
        Object {
          "eventId": "[id-1]",
          "token": "[id-2]",
        }
      `);
      const tokenId = registrationToken.token;

      // If you need to, you can query the DB within the context of this
      // function - e.g. to check that your mutation made the changes you'd
      // expect.
      const { rows } = await asRoot(pgClient, () =>
        pgClient.query(
          `SELECT * FROM app_public.registration_tokens WHERE token = $1`,
          [tokenId]
        )
      );
      if (rows.length !== 1) {
        throw new Error("Token not found!");
      }
      expect(rows[0].event_id).toEqual(registrationToken.eventId);
    }
  );
});
