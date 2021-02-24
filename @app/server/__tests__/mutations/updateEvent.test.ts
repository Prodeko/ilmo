import dayjs from "dayjs";

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
  const {
    event,
    organization,
    eventCategory,
    session,
  } = await createEventDataAndLogin();

  const day = dayjs("2021-02-20T12:00:00+02:00");

  await runGraphQLQuery(
    `mutation UpdateEvent(
      $eventId: UUID!
      $slug: String!
      $name: JSON!
      $description: JSON!
      $organizationId: UUID!
      $categoryId: UUID!
      $isHighlighted: Boolean
      $eventStartTime: Datetime!
      $eventEndTime: Datetime!
      $registrationStartTime: Datetime!
      $registrationEndTime: Datetime!
    ) {
      updateEvent(
        input: {
          id: $eventId
          patch: {
            slug: $slug
            name: $name
            description: $description
            ownerOrganizationId: $organizationId
            categoryId: $categoryId
            isHighlighted: $isHighlighted
            eventStartTime: $eventStartTime
            eventEndTime: $eventEndTime
            registrationStartTime: $registrationStartTime
            registrationEndTime: $registrationEndTime
          }
        }
      ) {
        event {
          id
          name
          description
          ownerOrganizationId
          categoryId
          isHighlighted
          eventStartTime
          eventEndTime
          registrationStartTime
          registrationEndTime
        }
      }
    }`,

    // GraphQL variables:
    {
      eventId: event.id,
      slug: event.slug,
      name: { fi: "Päivitetty testitapahtuma", en: "Updated test event" },
      description: {
        fi: "Päivitetty testikuvaus",
        en: "Updated test description",
      },
      organizationId: organization.id,
      categoryId: eventCategory.id,
      isHighlighted: true,
      eventStartTime: day.add(2, "hour").toISOString(),
      eventEndTime: day.add(3, "hour").toISOString(),
      registrationStartTime: day.toISOString(),
      registrationEndTime: day.add(1, "hour").toISOString(),
    },

    // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
    {
      user: { session_id: session.uuid },
    },

    // This function runs all your test assertions:
    async (json, { pgClient }) => {
      expect(json.errors).toBeFalsy();
      expect(json.data).toBeTruthy();

      const updatedEvent = json.data!.updateEvent.event;

      expect(updatedEvent).toBeTruthy();
      expect(updatedEvent.ownerOrganizationId).toEqual(organization.id);

      expect(sanitize(updatedEvent)).toMatchInlineSnapshot(`
        Object {
          "categoryId": "[id-3]",
          "description": Object {
            "en": "Updated test description",
            "fi": "Päivitetty testikuvaus",
          },
          "eventEndTime": "[timestamp-2]",
          "eventStartTime": "[timestamp-1]",
          "id": "[id-1]",
          "isHighlighted": true,
          "name": Object {
            "en": "Updated test event",
            "fi": "Päivitetty testitapahtuma",
          },
          "ownerOrganizationId": "[id-2]",
          "registrationEndTime": "[timestamp-4]",
          "registrationStartTime": "[timestamp-3]",
        }
      `);

      const { rows } = await asRoot(pgClient, () =>
        pgClient.query(`SELECT * FROM app_public.events WHERE id = $1`, [
          updatedEvent.id,
        ])
      );

      if (rows.length !== 1) {
        throw new Error("Event not found!");
      }
      expect(rows[0].id).toEqual(updatedEvent.id);
    }
  );
});
