import { PoolClient } from "pg";

import {
  createEventCategories,
  createEvents,
  createOrganizations,
} from "../../../../__tests__/helpers";
import {
  asRoot,
  assertJobComplete,
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
    client.query("select * from app_public.registration_tokens where id = $1", [
      token,
    ])
  );
  return row;
}

it("Can claim registration token", () =>
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
      tokenId: registrationToken.id,
    });

    // Assert that the job can run correctly
    // Run thes job
    await runJobs(client);
    await assertJobComplete(client, job);

    const t1 = await getRegistrationToken(client, registrationToken.id);
    expect(t1).toBeTruthy();

    // TODO: Figure out how to test this properly. Need to most likely
    // do some changes to registration_delete_registration_token.
    // and await the db call or something...
    const THIRTY_MINUTES = 1000 * 30 * 60;
    jest.advanceTimersByTime(THIRTY_MINUTES);

    // const t2 = await getRegistrationToken(client, registrationToken.id);
    // sexpect(t2).toBeUndefined();
  }));
