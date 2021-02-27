import dayjs from "dayjs";
import slugify from "slugify";

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

test("CreateEvent", async () => {
  const {
    organization,
    eventCategory,
    session,
  } = await createEventDataAndLogin();

  const day = dayjs("2021-02-20");
  const daySlug = day.format("YYYY-M-D");
  const slug = slugify(`${daySlug}-testitapahtuma`, {
    lower: true,
  });

  await runGraphQLQuery(
    `mutation CreateEvent(
      $slug: String!
      $name: JSON!
      $description: JSON!
      $organizationId: UUID!
      $categoryId: UUID!
      $isHighlighted: Boolean
      $isDraft: Boolean
      $eventStartTime: Datetime!
      $eventEndTime: Datetime!
      $registrationStartTime: Datetime!
      $registrationEndTime: Datetime!
    ) {
      createEvent(
        input: {
          event: {
            slug: $slug
            name: $name
            description: $description
            ownerOrganizationId: $organizationId
            categoryId: $categoryId
            isHighlighted: $isHighlighted
            isDraft: $isDraft
            eventStartTime: $eventStartTime
            eventEndTime: $eventEndTime
            registrationStartTime: $registrationStartTime
            registrationEndTime: $registrationEndTime
          }
        }
      ) {
        event {
          id
          slug
          name
          description
          ownerOrganizationId
          categoryId
          isHighlighted
          isDraft
        }
      }
    }`,

    // GraphQL variables:
    {
      slug: slug,
      name: { fi: "Testitapahtuma", en: "Test event" },
      description: { fi: "Testikuvaus", en: "Test description" },
      organizationId: organization.id,
      categoryId: eventCategory.id,
      isHighlighted: true,
      isDraft: false,
      eventStartTime: day.add(1, "days").toISOString(),
      eventEndTime: day.add(2, "days").toISOString(),
      registrationStartTime: day.toISOString(),
      registrationEndTime: day.add(7, "hour").toISOString(),
    },

    // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
    {
      user: { session_id: session.uuid },
    },

    // This function runs all your test assertions:
    async (json, { pgClient }) => {
      expect(json.errors).toBeFalsy();
      expect(json.data).toBeTruthy();

      const event = json.data!.createEvent.event;

      expect(event).toBeTruthy();
      expect(event.ownerOrganizationId).toEqual(organization.id);
      expect(event.categoryId).toEqual(eventCategory.id);

      expect(sanitize(event)).toMatchInlineSnapshot(`
        Object {
          "categoryId": "[id-3]",
          "description": Object {
            "en": "Test description",
            "fi": "Testikuvaus",
          },
          "id": "[id-1]",
          "isDraft": false,
          "isHighlighted": true,
          "name": Object {
            "en": "Test event",
            "fi": "Testitapahtuma",
          },
          "ownerOrganizationId": "[id-2]",
          "slug": "2021-2-20-testitapahtuma",
        }
      `);

      const { rows } = await asRoot(pgClient, () =>
        pgClient.query(`SELECT * FROM app_public.events WHERE id = $1`, [
          event.id,
        ])
      );

      if (rows.length !== 1) {
        throw new Error("Event not found!");
      }
      expect(rows[0].id).toEqual(event.id);
    }
  );
});
