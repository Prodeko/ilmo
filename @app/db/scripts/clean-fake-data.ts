import { Pool, PoolClient } from "pg"

if (process.env.NODE_ENV !== "development") {
  console.error("This script should only be ran in development!")
  process.exit(0)
}

async function cleanData(client: PoolClient) {
  return client.query(
    `BEGIN;
      drop function if exists app_private.tg__refresh_materialized_view cascade;
      drop materialized view if exists app_hidden.registrations_status_and_position cascade;
      delete
        from app_public.users
        where username like 'testuser%'
        or username = 'testuser'
        or id in (select user_id from app_public.user_emails where email like 'testuser%@example.com');

      delete from app_public.registrations;
      delete from app_public.quotas;
      delete from app_private.registration_secrets;
      delete from app_public.events;
      delete from app_public.event_categories;
      delete from app_public.event_questions;
      delete from app_public.organizations;
    COMMIT; `
  )
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL not set!")
  }

  const pgPool = new Pool({ connectionString })
  const client = await pgPool.connect()
  try {
    await cleanData(client)
  } catch (e) {
    if (typeof e.code === "string" && e.code.match(/^[0-9A-Z]{5}$/)) {
      console.error([e.message, e.code, e.detail, e.hint, e.where].join("\n"))
    }
    throw e
  } finally {
    await client.query("ROLLBACK;")
    client.release()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
