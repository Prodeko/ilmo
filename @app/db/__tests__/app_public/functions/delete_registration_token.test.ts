import { createEventData, withUserDb } from "../../helpers";

it("can delete registration token with app_public.delete_registration_token", () =>
  withUserDb(async (client) => {
    const { event } = await createEventData(client);
    const {
      rows: [registrationToken],
    } = await client.query(
      `select * from app_public.claim_registration_token($1)`,
      [event.id]
    );

    const {
      rows: [rows1],
    } = await client.query(
      "select * from app_public.delete_registration_token($1)",
      [registrationToken.claim_registration_token]
    );

    let numberOfRowsDeleted = rows1.delete_registration_token;
    expect(numberOfRowsDeleted).toBe("1");

    const {
      rows: [rows0],
    } = await client.query(`select app_public.delete_registration_token ($1)`, [
      event.id,
    ]);
    numberOfRowsDeleted = rows0.delete_registration_token;
    expect(numberOfRowsDeleted).toEqual("0");
  }));
