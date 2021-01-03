import {
  Event,
  EventCategory,
  Organization,
  Quota,
  Registration,
  User as SchemaUser,
} from "@app/graphql/index";
import dayjs from "dayjs";
import * as faker from "faker";
import { PoolClient } from "pg";
import slugify from "slugify";

export type User = SchemaUser & {
  _email: string;
  _password: string;
};

/**
 * The utility functions below are used to prepopulate the database with objects
 * that might be needed by other tests or scripts.
 */

let userCreationCounter = 0;
if (process.env.IN_TESTS) {
  // Enables multiple calls to `createUsers` within the same test to still have
  // deterministic results without conflicts.
  beforeEach(() => {
    userCreationCounter = 0;
  });
}

export const createUsers = async function createUsers(
  client: PoolClient,
  count: number = 1,
  verified: boolean = true
) {
  const users = [];
  if (userCreationCounter > 25) {
    throw new Error("Too many users created!");
  }
  for (let i = 0; i < count; i++) {
    const userLetter = "abcdefghijklmnopqrstuvwxyz"[userCreationCounter];
    userCreationCounter++;
    const password = userLetter.repeat(12);
    const email = `${userLetter}${i || ""}@b.c`;
    const user: User = (
      await client.query(
        `select * from app_private.really_create_user(
        username := $1,
        email := $2,
        email_is_verified := $3,
        name := $4,
        avatar_url := $5,
        password := $6
      )`,
        [
          `testuser_${userLetter}`,
          email,
          verified,
          `User ${userLetter}`,
          null,
          password,
        ]
      )
    ).rows[0];
    user._email = email;
    user._password = password;
    users.push(user);
  }
  return users;
};

/******************************************************************************/
// Organizations

export const createOrganizations = async function createOrganizations(
  client: PoolClient,
  count: number = 1
) {
  const organizations: Organization[] = [];
  for (let i = 0; i < count; i++) {
    const slug = `organization-${i}`;
    const name = `Organization ${i}`;
    const {
      rows: [organization],
    } = await client.query(
      `
        select * from app_public.create_organization($1, $2)
      `,
      [slug, name]
    );
    organizations.push(organization);
  }

  return organizations;
};

/******************************************************************************/
// Sessions

export const createSession = async (
  client: PoolClient,
  userId: string
): Promise<{ uuid: string }> => {
  const {
    rows: [session],
  } = await client.query(
    `
      insert into app_private.sessions(user_id)
      values ($1::uuid)
      returning *
    `,
    [userId]
  );
  return session;
};

/******************************************************************************/
// Events

export const createEventCategories = async function createEventCategories(
  client: PoolClient,
  count: number = 1,
  organizationId: string
) {
  const categories: EventCategory[] = [];
  for (let i = 0; i < count; i++) {
    const name = `Category ${i}`;
    const description = faker.lorem.paragraph();
    const ownerOrganizationId = organizationId;
    const {
      rows: [category],
    } = await client.query(
      `
        insert into app_public.event_categories(name, description, owner_organization_id)
        values ($1, $2, $3)
        returning *
      `,
      [name, description, ownerOrganizationId]
    );
    categories.push(category);
  }

  return categories;
};

export const createEvents = async function createEvents(
  client: PoolClient,
  count: number = 1,
  organizationId: string,
  categoryId: string
) {
  const events: Event[] = [];
  for (let i = 0; i < count; i++) {
    const name = faker.lorem.words();
    const description = faker.lorem.paragraphs();
    const startTime = faker.date.soon();
    const endTime = faker.date.soon();
    const ownerOrganizationId = organizationId;
    const eventCategoryId = categoryId;

    const daySlug = dayjs(startTime).format("YYYY-M-D");
    const slug = slugify(`${daySlug}-${name}`, {
      lower: true,
    });

    const {
      rows: [event],
    } = await client.query(
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
        ownerOrganizationId,
        eventCategoryId,
      ]
    );
    events.push(event);
  }

  return events;
};

/******************************************************************************/
// Quotas

export const createQuotas = async function createQuotas(
  client: PoolClient,
  count: number = 1,
  eventId: string
) {
  const quotas: Quota[] = [];
  for (let i = 0; i < count; i++) {
    const title = faker.git.branch();
    const size = faker.random.number({
      min: 1,
      max: 50,
    });
    const {
      rows: [quota],
    } = await client.query(
      `
        insert into app_public.quotas(title, size, event_id)
        values ($1, $2, $3)
        returning *
      `,
      [title, size, eventId]
    );
    quotas.push(quota);
  }

  return quotas;
};

/******************************************************************************/
// Quotas

export const createRegistrations = async function createRegistrations(
  client: PoolClient,
  count: number = 1,
  eventId: string,
  quotaId: string
) {
  const registrations: Registration[] = [];
  for (let i = 0; i < count; i++) {
    const firstName = faker.name.firstName();
    const lastName = faker.name.lastName();
    const email = faker.internet.email();
    const {
      rows: [registration],
    } = await client.query(
      `
        insert into app_public.registrations(event_id, quota_id, first_name, last_name, email)
        values ($1, $2, $3, $4, $5)
        returning *
      `,
      [eventId, quotaId, firstName, lastName, email]
    );
    registrations.push(registration);
  }

  return registrations;
};
