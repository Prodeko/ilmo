import { createNodeRedisClient } from "handy-redis";

import {
  asRoot,
  assertJobComplete,
  createEventDataAndLogin,
  deleteTestData,
  getJobs,
  runGraphQLQuery,
  runJobs,
  sanitize,
  setup,
  teardown,
} from "../helpers";

beforeEach(deleteTestData);
beforeAll(setup);
afterAll(teardown);

test("CreateRegistration", async () => {
  const { event, quota, registrationToken } = await createEventDataAndLogin();
  // Set rate-limiting key artificially to redis. Normally RateLimitPlugin
  // would set this key after a client calls claimRegistrationToken.
  // Server mutation tests are run in isolation with runGraphQLQuery and the
  // transaction is rolled back after each test. This means that we can't test
  // multiple mutations in a single test. End-to-end tests should verify
  // functionality that depends on multiple mutations. CreateRegistration
  // mutation should delete this key if it completes successfully.
  //
  // A bit more info about the overall event registration setup.
  // We have a custom plugin (EventRegistrationPlugin) that wraps the
  // CreateRegistration mutation. This plugin is reponsible for dispatching
  // a graphile-worker event that deletes the rate limit key from redis
  // after successful registration.
  //
  // This setup is designed to prevent people from claiming registration
  // tokens by calling the API and then distributing registration tokens
  // to their friends. By rate limiting the claimRegistrationToken
  // endpoint we prevent this. After the registration is complete the rate
  // limit key should be removed from redis. This enables multiple people to
  // use the same computer for registering to an event.

  const key = `rate-limit:claimRegistrationToken:${event.id}:127.1.1.1`;
  const redisClient = createNodeRedisClient({
    url: process.env.TEST_REDIS_URL,
  });
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

      // Escape transaction set by runGraphQLQuery.
      //
      // When inside a transaction, SQL date functions return values based on
      // the __start time of the current transaction__. This is a problem since
      // graphile-worker only executes a task if its run_at property is less than
      // now(). Our helper function runGraphQLQuery sets up a transaction by calling
      // withPostGraphileContext. Next we run the CreateRegistration mutation that
      // we are testing. The mutation goes through EventRegistrationPlugin which schedules
      // a task called `registration_complete__delete_rate_limit_key`. Next we call
      // `runJobs` that executes a graphile-worker function called `runTaskListOnce`.
      // This function calls a graphile-worker database function called graphile_worker.get_job
      // which only returns a task to run if run_at <= now(). As explained earlier, we are
      // inside a transaction and calls to now() return the timestamp of when the
      // transaction was created (which is before the mutation is run). Thus
      // run_at >= now() and the task is not executed if we don't end the transaction here.
      await pgClient.query("commit");

      // Assert that the job can run correctly
      // Run the job
      await runJobs(pgClient);
      await assertJobComplete(pgClient, job);

      // Redis should not contain a rate limiting key after
      // successful registration
      const value = await redisClient.get(key);
      expect(value).toEqual(null);
    }
  );
});
