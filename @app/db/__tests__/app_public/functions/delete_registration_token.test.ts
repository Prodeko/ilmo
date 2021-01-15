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

it("can delete registration token with app_public.delete_registration_token", () =>
  withUserDb(async (client) => {
    const { event } = await createEventData(client);
    const {
      rows: tokenRows,
    } = await client.query(
      `select * from app_public.claim_registration_token($1)`,
      [event.id]
    );
    const {
      rows: [createdTokenRow],
    } = await client.query(
      "select * from app_public.delete_registration_token($1)",
      [tokenRows[0].token]
    );

    let numberOfRowsDeleted = createdTokenRow.delete_registration_token;
    expect(numberOfRowsDeleted).toBe("1");

    const {
      rows: [deletedTokenRow],
    } = await client.query(`select app_public.delete_registration_token ($1)`, [
      event.id,
    ]);
    numberOfRowsDeleted = deletedTokenRow.delete_registration_token;
    expect(numberOfRowsDeleted).toEqual("0");
  }));
