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

describe("UpdateEventQuotas", () => {
  it("can use custom mutation to update multiple quotas", async () => {
    // Create two quotas, the other one should be deleted on update
    const { event, session, quotas } = await createEventDataAndLogin({
      quotaOptions: { create: true, amount: 2 },
      registrationOptions: { create: false },
    });

    await runGraphQLQuery(
      `mutation UpdateEventQuotas($input: UpdateEventQuotasInput!) {
        updateEventQuotas(input: $input) {
          quotas {
            id
            title
            size
            eventId
          }
        }
      }`,

      // GraphQL variables:
      {
        input: {
          eventId: event.id,
          quotas: [
            {
              id: quotas[0].id,
              size: 1,
              title: {
                en: "Test quota 1",
                fi: "Testikiintiö 1",
              },
            },
            {
              id: quotas[1].id,
              size: 2,
              title: {
                fi: "Testikiintiö 2",
                en: "Test quota 2",
              },
            },
            {
              // Should also be able to create new quotas via this mutation if
              // id is not specified
              size: 2,
              title: {
                fi: "Testikiintiö 3",
                en: "Test quota 3",
              },
            },
          ],
        },
      },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {
        user: { session_id: session.uuid },
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy();
        expect(json.data).toBeTruthy();

        const quotas = json.data!.updateEventQuotas.quotas;

        expect(quotas).toBeTruthy();
        expect(quotas.length).toEqual(3);
        expect(quotas[0].eventId).toEqual(event.id);

        expect(sanitize(quotas)).toMatchInlineSnapshot(`
        Array [
          Object {
            "eventId": "[id-2]",
            "id": "[id-1]",
            "size": 1,
            "title": Object {
              "en": "Test quota 1",
              "fi": "Testikiintiö 1",
            },
          },
          Object {
            "eventId": "[id-2]",
            "id": "[id-3]",
            "size": 2,
            "title": Object {
              "en": "Test quota 2",
              "fi": "Testikiintiö 2",
            },
          },
          Object {
            "eventId": "[id-2]",
            "id": "[id-4]",
            "size": 2,
            "title": Object {
              "en": "Test quota 3",
              "fi": "Testikiintiö 3",
            },
          },
        ]
      `);

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.quotas WHERE event_id = $1`,
            [event.id]
          )
        );

        if (rows.length !== 3) {
          throw new Error("Quotas not found!");
        }
        expect(rows[0].event_id).toEqual(event.id);
      }
    );
  });

  it("must specify at least one event quota", async () => {
    const { event, session } = await createEventDataAndLogin({
      quotaOptions: { create: false },
      registrationOptions: { create: false },
    });

    await runGraphQLQuery(
      `mutation UpdateEventQuotas($input: UpdateEventQuotasInput!) {
        updateEventQuotas(input: $input) {
          quotas {
            id
            title
            size
            eventId
          }
        }
      }`,

      // GraphQL variables:
      {
        input: {
          eventId: event.id,
          quotas: [],
        },
      },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {
        user: { session_id: session.uuid },
      },

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy();

        const message = json.errors![0].message;
        expect(message).toEqual("You must specify at least one quota");
      }
    );
  });

  it("can't update quotas while logged out", async () => {
    const { event, quotas } = await createEventDataAndLogin({
      quotaOptions: { create: true, amount: 3 },
      registrationOptions: { create: false },
    });

    await runGraphQLQuery(
      `mutation UpdateEventQuotas($input: UpdateEventQuotasInput!) {
        updateEventQuotas(input: $input) {
          quotas {
            id
            title
            size
            eventId
          }
        }
      }`,

      // GraphQL variables:
      {
        input: {
          eventId: event.id,
          quotas: [
            {
              id: quotas[0].id,
              size: 1,
              title: {
                fi: "Testikiintiö 1",
                en: "Test quota 1",
              },
            },
          ],
        },
      },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy();

        const message = json.errors![0].message;
        expect(message).toEqual("You must log in to update event quotas");
      }
    );
  });
});
