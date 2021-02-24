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

test("UpdateEvent", async () => {
  const { registration } = await createEventDataAndLogin();

  await runGraphQLQuery(
    `mutation UpdateEventRegistration(
      $registrationId: UUID!
      $firstName: String!
      $lastName: String!
    ) {
      updateRegistration(
        input: {
          id: $registrationId
          patch: { firstName: $firstName, lastName: $lastName }
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
      registrationId: registration.id,
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
        pgClient.query(`SELECT * FROM app_public.registrations WHERE id = $1`, [
          updatedRegistration.id,
        ])
      );

      if (rows.length !== 1) {
        throw new Error("Registration not found!");
      }
      expect(rows[0].id).toEqual(updatedRegistration.id);
    }
  );
});
