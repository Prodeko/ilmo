import { random, sample } from "lodash";
import { Pool, PoolClient } from "pg";

import {
  createEventCategories,
  createEvents,
  createOrganizations,
  createQuotas,
  createRegistrations,
  createSession,
  User,
} from "../../__tests__/data";

if (process.env.NODE_ENV !== "development") {
  console.error("This script should only be ran in development!");
  process.exit(0);
}

async function createUser(client: PoolClient, username: string) {
  const {
    rows: [existingUser],
  } = await client.query<User>(
    `select * from app_public.users where username = $1`,
    [username]
  );

  if (existingUser) {
    return existingUser;
  }

  const {
    rows: [user],
  } = await client.query(
    `SELECT * FROM app_private.really_create_user(
        username := $1,
        email := $2,
        email_is_verified := $3,
        name := $4,
        avatar_url := $5,
        password := $6
      )`,
    [username, `${username}@prodeko.org`, true, username, null, "kananugetti"]
  );
  return user;
}

async function generateData(client: PoolClient) {
  const username = process.argv[2];
  if (!username) {
    throw new Error("Username must be provided as an argument");
  }

  const countEvents = Number(process.argv[3] || 1);
  // Become root
  client.query("reset role");

  const user = await createUser(client, username);
  const session = await createSession(client, user.id);

  await client.query(
    `select set_config('role', $1::text, true), set_config('jwt.claims.session_id', $2::text, true)`,
    [process.env.DATABASE_VISITOR, session.uuid]
  );

  // Create data
  const organizations = await createOrganizations(client, 3);
  organizations.forEach(async (o) => {
    const eventCategories = await createEventCategories(client, 5, o.id);
    const events = await createEvents(
      client,
      countEvents,
      o.id,
      sample(eventCategories).id
    );
    events.forEach(async (e) => {
      const quotas = await createQuotas(client, 5, e.id);
      quotas.forEach(async (q) => {
        await createRegistrations(client, random(0, 25), e.id, q.id);
      });
    });
  });
  // More fake data generation can be added here if needed
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set!");
  }

  const pgPool = new Pool({ connectionString });
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await generateData(client);
    await client.query("COMMIT");
  } catch (e) {
    // Error logging can be helpful:
    if (typeof e.code === "string" && e.code.match(/^[0-9A-Z]{5}$/)) {
      console.error([e.message, e.code, e.detail, e.hint, e.where].join("\n"));
    }
    throw e;
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
