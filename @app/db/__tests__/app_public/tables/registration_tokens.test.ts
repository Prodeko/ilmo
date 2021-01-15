import { PoolClient } from "pg";

import {
  createEventCategories,
  createEvents,
  createOrganizations,
  withUserDb,
} from "../../helpers";

async function createEventData(client: PoolClient) {
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

  return { organization, eventCategory, event };
}

it("cannot query registration tokens with user db connection", () =>
  withUserDb(async (client) => {
    const promise = client.query(
      `select * from app_public.registration_tokens`
    );
    await expect(promise).rejects.toThrow(
      /permission denied for (table|relation) registration_tokens/
    );
  }));

it("cannot manually create a registration token", () =>
  withUserDb(async (client) => {
    const { event } = await createEventData(client);
    const promise = client.query(
      `insert into app_public.registration_tokens (event_id) values ($1) returning *`,
      [event.id]
    );
    await expect(promise).rejects.toThrow(
      /permission denied for (table|relation) registration_tokens/
    );
  }));

it("cannot manually update a registration token", () =>
  withUserDb(async (client) => {
    const { event } = await createEventData(client);
    await client.query(
      `select * from app_public.claim_registration_token($1)`,
      [event.id]
    );
    const promise = client.query(
      `update app_public.registration_tokens set event_id = $1`,
      [event.id]
    );
    await expect(promise).rejects.toThrow(
      /permission denied for (table|relation) registration_tokens/
    );
  }));

it("cannot manually delete a registration token", () =>
  withUserDb(async (client) => {
    const { event } = await createEventData(client);
    await client.query(
      `select * from app_public.claim_registration_token($1)`,
      [event.id]
    );
    const promise = client.query(
      `delete from app_public.registration_tokens where event_id = $1`,
      [event.id]
    );
    await expect(promise).rejects.toThrow(
      /permission denied for (table|relation) registration_tokens/
    );
  }));
