import { createNodeRedisClient } from "handy-redis";
import {
  asRoot,
  createEventDataAndLogin,
  deleteTestData,
  runGraphQLQuery,
  sanitize,
  setup,
  teardown,
  assertJobComplete,
  getJobs,
  runJobs,
} from "../helpers";

beforeEach(deleteTestData);
beforeAll(setup);
afterAll(teardown);

jest.setTimeout(300000);

test("CreateRegistration", async () => {
  const { event, quota, registrationToken } = await createEventDataAndLogin();
  // Set rate-limiting key artificially to redis. Normally RateLimitPlugin
  // would set this key after calling claimRegistrationToken. Server
  // mutation tests are run in isolation with runGraphQLQuery and the
  // transaction is rolled back after each test. So we can't test multiple
  // mutations in a single test. End-to-end tests should verify functionality
  // that depends on multiple mutations. CreateRegistration should delete
  // this key after it has completed successfully.
  //
  // We wrap the CreateRegistration mutation in EventRegistrationPlugin,
  // which dispatches the registration_complete__delete_rate_limit_key
  // graphile worker task that

  const key = `rate-limit:claimRegistrationToken:${event.id}:127.1.1.1`;
  const redisClient = createNodeRedisClient({ url: process.env.REDIS_URL });
  await redisClient.incr(key);
  redisClient.quit();

  await runGraphQLQuery(
    `mutation CreateRegistration(
      $eventId: UUID!
      $quotaId: UUID!
      $firstName: String!
      $lastName: String!
      $email: String!
      $token: UUID!
    ) {
      createRegistration(
        input: {
          eventId: $eventId
          quotaId: $quotaId
          firstName: $firstName
          lastName: $lastName
          email: $email
          token: $token
        }
      ) {
        registration {
          id
          firstName
          lastName
        }
      }
    }
    `,

    // GraphQL variables:
    {
      eventId: event.id,
      quotaId: quota.id,
      firstName: "Testname",
      lastName: "Testlastname",
      email: "testuser@example.com",
      token: registrationToken.token,
    },

    // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
    {},

    // This function runs all your test assertions:
    async (json, { pgClient, redisClient, req }) => {
      expect(json.errors).toBeFalsy();
      expect(json.data).toBeTruthy();

      const registration = json.data!.createRegistration.registration;

      expect(registration).toBeTruthy();
      expect(registration.id).toBeTruthy();
      expect(registration.firstName).toEqual("Testname");
      expect(registration.lastName).toEqual("Testlastname");

      expect(sanitize(registration)).toMatchInlineSnapshot(`
        Object {
          "firstName": "Testname",
          "id": "[id-1]",
          "lastName": "Testlastname",
        }
      `);

      const { rows } = await asRoot(pgClient, () =>
        pgClient.query(`SELECT * FROM app_public.registrations WHERE id = $1`, [
          registration.id,
        ])
      );

      if (rows.length !== 1) {
        throw new Error("Registration not found!");
      }
      expect(rows[0].id).toEqual(registration.id);

      // TODO: Figure out why this job doesn't run
      const jobs = await getJobs(
        pgClient,
        "registration_complete__delete_rate_limit_key"
      );

      expect(jobs).toHaveLength(1);
      const [job] = jobs;
      expect(job.payload).toMatchObject({
        eventId: event.id,
        ipAddress: req.ip,
      });

      // Assert that the job can run correctly
      // Run the job
      await runJobs(pgClient);
      await assertJobComplete(pgClient, job);

      const value = await redisClient.get(key);

      // Redis should not contain a rate limiting key after
      // successful registration
      expect(value).toEqual("");
    }
  );
});
