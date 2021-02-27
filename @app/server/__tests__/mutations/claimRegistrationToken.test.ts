import {
  asRoot,
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
  const { event } = await createEventDataAndLogin();
  await runGraphQLQuery(
    `mutation ClaimRegistrationToken($eventId: UUID!) {
      claimRegistrationToken(input: { eventId: $eventId }) {
        registrationToken {
          token
          eventId
        }
      }
    }`,

    // GraphQL variables:
    {
      eventId: event.id,
    },

    // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
    {},

    // This function runs all your test assertions:
    async (json, { pgClient, redisClient, req }) => {
      expect(json.errors).toBeFalsy();
      expect(json.data).toBeTruthy();

      const registrationToken = json.data!.claimRegistrationToken
        .registrationToken;

      expect(registrationToken).toBeTruthy();
      expect(registrationToken.eventId).toEqual(event.id);

      expect(sanitize(registrationToken)).toMatchInlineSnapshot(`
        Object {
          "eventId": "[id-2]",
          "token": "[id-1]",
        }
      `);

      const token = registrationToken.token;
      const { rows } = await asRoot(pgClient, () =>
        pgClient.query(
          `SELECT * FROM app_public.registration_tokens WHERE token = $1`,
          [token]
        )
      );
      if (rows.length !== 1) {
        throw new Error("Token not found!");
      }
      expect(rows[0].event_id).toEqual(registrationToken.eventId);

      const redisKey = `rate-limit:claimRegistrationToken:${event.id}:${req.ip}`;
      const value = await redisClient.get(redisKey);

      // Redis should contain rate limit value after calling
      // claimRegistrationToken
      expect(value).toEqual("1");
    }
  );
});
