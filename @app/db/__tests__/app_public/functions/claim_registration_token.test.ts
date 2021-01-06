import { PoolClient } from "pg";

import {
  asRoot,
  assertJobComplete,
  createEventCategories,
  createEvents,
  createOrganizations,
  getJobs,
  runJobs,
  withUserDb,
} from "../../helpers";

async function claimToken(client: PoolClient, eventId: string | null | void) {
  const {
    rows: [row],
  } = await client.query(
    `select * from app_public.claim_registration_token($1)`,
    [eventId]
  );
  return row;
}

async function getRegistrationToken(client: PoolClient, token: string) {
  const {
    rows: [row],
  } = await asRoot(client, () =>
    client.query(
      "select * from app_public.registration_tokens where token = $1",
      [token]
    )
  );
  return row;
}

it("Can claim registration token and token expires", () =>
  withUserDb(async (client, _user) => {
    // "modern" can be removed in Jest 27, it is opt-in in version 26
    jest.useFakeTimers("modern");

    const [organization] = await createOrganizations(client, 1);
    const [eventCategory] = await createEventCategories(
      client,
      1,
      organization.id
    );
    const [event] = await createEvents(
      client,
      1,
      organization.id,
      eventCategory.id
    );

    // Action
    await claimToken(client, event.id);

    // Assertions
    const { rows: registrationTokens } = await asRoot(client, () =>
      client.query(
        "select * from app_public.registration_tokens where event_id = $1",
        [event.id]
      )
    );

    expect(registrationTokens).toHaveLength(1);
    const [registrationToken] = registrationTokens;
    expect(registrationToken.event_id).toEqual(event.id);

    const jobs = await getJobs(
      client,
      "registration__delete_registration_token"
    );
    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    expect(job.payload).toMatchObject({
      token: registrationToken.token,
    });

    // Assert that the job can run correctly
    // Run the job
    await runJobs(client);
    await assertJobComplete(client, job);

    const THIRTY_MINUTES = 1000 * 30 * 60;

    // Token should exist in the database after creating it
    const t1 = await getRegistrationToken(client, registrationToken.token);
    expect(t1).toBeTruthy();

    // Token should still be in the database 1ms before expiration
    jest.advanceTimersByTime(THIRTY_MINUTES - 1);
    const t2 = await getRegistrationToken(client, registrationToken.token);
    expect(t2).toBeTruthy();

    // Token should be deleted from db at expiration
    jest.advanceTimersByTime(1);
    const t3 = await getRegistrationToken(client, registrationToken.token);
    expect(t3).toBeUndefined();
  }));
