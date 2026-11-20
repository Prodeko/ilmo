import { promises as fs } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { migrate, reset, Settings } from "graphile-migrate"
import { Client } from "pg"

/*
 * committed/000008.sql replaces the `constrained_name` check, which accepted
 * an empty string, with one that requires a non-whitespace character. A
 * database that stores a blank registration name must still migrate: the
 * migration turns those names into null before it adds the check.
 *
 * This test builds a scratch database from the committed migrations up to
 * 000007, stores registrations with blank names there, and then applies the
 * remaining migrations the way a deploy does (`graphile-migrate migrate`).
 */

const MIGRATIONS = join(__dirname, "../../migrations")
const BEFORE = "000008"
const {
  ROOT_DATABASE_URL,
  DATABASE_HOST,
  DATABASE_NAME,
  DATABASE_OWNER,
  DATABASE_OWNER_PASSWORD,
  DATABASE_AUTHENTICATOR,
  DATABASE_VISITOR,
  AZURE_DB_OWNER,
} = process.env
const SCRATCH_DATABASE = `${DATABASE_NAME}_migration_check`

let folder: string
let settings: Settings

async function withScratchDb<T>(callback: (client: Client) => Promise<T>) {
  const url = new URL(ROOT_DATABASE_URL!)
  url.pathname = `/${SCRATCH_DATABASE}`
  const client = new Client({ connectionString: url.toString() })
  await client.connect()
  try {
    return await callback(client)
  } finally {
    await client.end()
  }
}

/** Copies the committed migrations that `include` selects into `folder`. */
async function copyCommitted(include: (filename: string) => boolean) {
  const files = await fs.readdir(join(MIGRATIONS, "committed"))
  for (const file of files.filter((f) => f.endsWith(".sql") && include(f))) {
    await fs.copyFile(
      join(MIGRATIONS, "committed", file),
      join(folder, "committed", file)
    )
  }
}

beforeAll(async () => {
  folder = await fs.mkdtemp(join(tmpdir(), "ilmo-migrations-"))
  await fs.mkdir(join(folder, "committed"))
  await fs.writeFile(join(folder, "current.sql"), "")
  await fs.copyFile(
    join(MIGRATIONS, "afterReset.sql"),
    join(folder, "afterReset.sql")
  )
  settings = {
    connectionString: `postgres://${DATABASE_OWNER}:${DATABASE_OWNER_PASSWORD}@${DATABASE_HOST}/${SCRATCH_DATABASE}`,
    rootConnectionString: ROOT_DATABASE_URL,
    migrationsFolder: folder,
    pgSettings: { search_path: "app_public,app_private,app_hidden,public" },
    placeholders: {
      ":DATABASE_AUTHENTICATOR": DATABASE_AUTHENTICATOR!,
      ":DATABASE_VISITOR": DATABASE_VISITOR!,
      ":AZURE_DB_OWNER": AZURE_DB_OWNER || DATABASE_OWNER!,
    },
    // As in @app/db/.gmrc
    afterReset: [
      "!afterReset.sql",
      {
        _: "command",
        command:
          'cross-env DATABASE_URL="$GM_DBURL" pnpm --filter @app/worker run install-db-schema',
      },
    ],
  }
  // graphile-migrate logs every migration it runs
  jest.spyOn(console, "info").mockImplementation(() => {})
})

afterAll(async () => {
  const client = new Client({ connectionString: ROOT_DATABASE_URL })
  await client.connect()
  await client.query(`drop database if exists ${SCRATCH_DATABASE}`)
  await client.end()
  await fs.rm(folder, { recursive: true, force: true })
})

it("turns blank registration names into null before checking them", async () => {
  await copyCommitted((file) => file < BEFORE)
  await reset(settings)
  await migrate(settings)

  const ids = await withScratchDb(async (client) => {
    // Stored as is, without the triggers (registration validity, emails)
    await client.query("begin")
    await client.query("set local session_replication_role = replica")
    const {
      rows: [{ id: organizationId }],
    } = await client.query(
      `insert into app_public.organizations (slug, name)
       values ('blank-names', 'Blank names') returning id`
    )
    const {
      rows: [{ id: categoryId }],
    } = await client.query(
      `insert into app_public.event_categories (name, description, owner_organization_id)
       values ('{"fi": "K", "en": "C"}', '{"fi": "K", "en": "C"}', $1) returning id`,
      [organizationId]
    )
    const {
      rows: [{ id: eventId }],
    } = await client.query(
      `insert into app_public.events (
         slug, name, description, location, event_start_time, event_end_time,
         registration_start_time, registration_end_time, open_quota_size,
         owner_organization_id, category_id
       ) values (
         'blank-names', '{"fi": "T", "en": "E"}', '{"fi": "T", "en": "E"}', 'Here',
         now() + interval '3 days', now() + interval '4 days',
         now() - interval '1 day', now() + interval '1 day', 0, $1, $2
       ) returning id`,
      [organizationId, categoryId]
    )
    const {
      rows: [{ id: quotaId }],
    } = await client.query(
      `insert into app_public.quotas (event_id, position, title, size)
       values ($1, 0, '{"fi": "K", "en": "Q"}', 10) returning id`,
      [eventId]
    )
    const { rows } = await client.query(
      `insert into app_public.registrations
         (event_id, quota_id, first_name, last_name, is_finished, updated_at)
       values
         ($1, $2, '', 'Wright', true, '2030-01-01T00:00:00Z'),
         ($1, $2, 'Anna', '', true, '2030-01-01T00:00:00Z'),
         ($1, $2, '', '', true, '2030-01-01T00:00:00Z'),
         ($1, $2, 'Kept', 'Name', true, '2030-01-01T00:00:00Z'),
         ($1, $2, null, null, false, '2030-01-01T00:00:00Z')
       returning id`,
      [eventId, quotaId]
    )
    await client.query("commit")
    return rows.map((r) => r.id)
  })

  await copyCommitted((file) => file >= BEFORE)
  await migrate(settings)

  await withScratchDb(async (client) => {
    const { rows } = await client.query(
      `select first_name, last_name, updated_at
       from app_public.registrations
       where id = any($1::uuid[])
       order by array_position($1::uuid[], id)`,
      [ids]
    )
    expect(rows.map((r) => [r.first_name, r.last_name])).toEqual([
      [null, "Wright"],
      ["Anna", null],
      [null, null],
      ["Kept", "Name"],
      [null, null],
    ])
    // The cleanup ran without the table's triggers
    for (const row of rows) {
      expect(row.updated_at.toISOString()).toBe("2030-01-01T00:00:00.000Z")
    }

    const {
      rows: [{ triggers_disabled }],
    } = await client.query(
      `select count(*)::int as triggers_disabled from pg_catalog.pg_trigger
       where tgrelid = 'app_public.registrations'::regclass
         and not tgisinternal and tgenabled = 'D'`
    )
    expect(triggers_disabled).toBe(0)

    await expect(
      client.query(
        `update app_public.registrations set first_name = ' ' where id = $1`,
        [ids[3]]
      )
    ).rejects.toThrow(/constrained_name_check/)
  })
}, 120000)
