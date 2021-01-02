import { Pool, PoolClient } from "pg";
import { sample } from "lodash";

import {
  createEventCategories,
  createEvents,
  createOrganizations,
  createSession,
  createUsers,
} from "../../__tests__/data";

if (process.env.NODE_ENV !== "development") {
  console.error("This script should only be ran in development!");
  process.exit(0);
}

async function generateData(client: PoolClient) {
  const count = Number(process.argv[2] || 1);
  // Become root
  client.query("reset role");

  // Create user and session
  const [user] = await createUsers(client, 1);
  const session = await createSession(client, user.id);
  await client.query(
    `select set_config('role', $1::text, true), set_config('jwt.claims.session_id', $2::text, true)`,
    [process.env.DATABASE_VISITOR, session.uuid]
  );

  // Create data
  const organizations = await createOrganizations(client, count);
  const eventCategories = await createEventCategories(
    client,
    count,
    sample(organizations).id
  );
  await createEvents(
    client,
    count,
    sample(organizations).id,
    sample(eventCategories).id
  );
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
