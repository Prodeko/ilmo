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

describe("UdpateRegistration", () => {
  test("can create a registration", async () => {
    const { registrationSecret } = await createEventDataAndLogin();

    await runGraphQLQuery(
      `mutation UpdateEventRegistration(
        $updateToken: UUID!
        $firstName: String!
        $lastName: String!
      ) {
        updateRegistration(
          input: {
            updateToken: $updateToken
            firstName: $firstName
            lastName: $lastName
          }
        ) {
          registration {
            id
            fullName
          }
        }
      }`,

      // GraphQL variables:
      {
        updateToken: registrationSecret.update_token,
        firstName: "Päivi",
        lastName: "Tetty",
      },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {
        user: {},
      },

      // This function runs all your test assertions:
      async (json, { pgClient }) => {
        expect(json.errors).toBeFalsy();
        expect(json.data).toBeTruthy();

        const updatedRegistration = json.data!.updateRegistration.registration;
        expect(updatedRegistration).toBeTruthy();

        expect(sanitize(updatedRegistration)).toMatchInlineSnapshot(`
          Object {
            "fullName": "Päivi Tetty",
            "id": "[id-1]",
          }
        `);

        const { rows } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.registrations WHERE id = $1`,
            [updatedRegistration.id]
          )
        );

        if (rows.length !== 1) {
          throw new Error("Registration not found!");
        }
        expect(rows[0].id).toEqual(updatedRegistration.id);
      }
    );
  });

  it("can't create registration if registration token is not valid", async () => {
    await runGraphQLQuery(
      `mutation UpdateEventRegistration(
        $updateToken: UUID!
        $firstName: String!
        $lastName: String!
      ) {
        updateRegistration(
          input: {
            updateToken: $updateToken
            firstName: $firstName
            lastName: $lastName
          }
        ) {
          registration {
            id
          }
        }
      }`,

      // GraphQL variables:
      {
        // Invalid update token
        updateToken: "a7def7b2-1687-48d8-839e-55e57f6ade85",
        firstName: "Päivi",
        lastName: "Tetty",
      },

      // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy();

        const message = json.errors![0].message;
        expect(message).toEqual("Registration matching token was not found.");
      }
    );
  });
});
