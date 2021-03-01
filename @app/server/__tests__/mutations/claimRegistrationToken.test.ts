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
  const { events } = await createEventDataAndLogin();
  const eventId = events[0].id;

  await runGraphQLQuery(
    `mutation ClaimRegistrationToken($eventId: UUID!) {
      claimRegistrationToken(input: { eventId: $eventId }) {
        registrationToken
      }
    }`,

    // GraphQL variables:
    {
      eventId,
    },

    // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
    {},

    // This function runs all your test assertions:
    async (json, { pgClient, redisClient, req }) => {
      expect(json.errors).toBeFalsy();
      expect(json.data).toBeTruthy();

      const tokenObject = json.data!.claimRegistrationToken;
      expect(tokenObject).toBeTruthy();

      expect(sanitize(tokenObject)).toMatchInlineSnapshot(`
        Object {
          "registrationToken": "[id-1]",
        }
      `);

      const registrationToken = tokenObject.registrationToken;
      const { rows } = await asRoot(pgClient, () =>
        pgClient.query(
          `SELECT * FROM app_private.registration_secrets WHERE registration_token = $1`,
          [registrationToken]
        )
      );

      if (rows.length !== 1) {
        throw new Error("Token not found!");
      }
      expect(rows[0].registration_token).toEqual(registrationToken);

      const redisKey = `rate-limit:claimRegistrationToken:${eventId}:${req.ip}`;
      const value = await redisClient.get(redisKey);

      // Redis should contain rate limit value after calling
      // claimRegistrationToken
      expect(value).toEqual("1");
    }
  );
});
