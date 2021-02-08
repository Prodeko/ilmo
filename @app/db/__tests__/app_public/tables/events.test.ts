import dayjs from "dayjs";

import {
  createEventCategories,
  createOrganizations,
  withUserDb,
} from "../../helpers";

it("cannot create event with start_time > end_time", () =>
  withUserDb(async (client) => {
    const [organization] = await createOrganizations(client, 1);
    const [eventCategory] = await createEventCategories(
      client,
      1,
      organization.id
    );

    const name = {
      fi: "Tapahtuma",
      en: "Event",
    };
    const description = {
      fi: "Testi",
      en: "Test",
    };

    // This is incorrect, should not be able to create a new
    // event where start_time > end_time
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    const startTime = today;
    const endTime = yesterday;

    const eventCategoryId = eventCategory.id;
    const daySlug = dayjs(startTime).format("YYYY-M-D");
    const slug = `${daySlug}-${name["fi"].toLowerCase()}`;

    const promise = client.query(
      `
        insert into app_public.events(name, slug, description, start_time, end_time, owner_organization_id, category_id)
        values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        name,
        slug,
        description,
        startTime,
        endTime,
        organization.id,
        eventCategoryId,
      ]
    );
    await expect(promise).rejects.toThrow(
      'new row for relation "events" violates check constraint "_cnstr_check_event_time"'
    );
  }));
