import { featureKeys } from "@app/lib"
import { PoolClient } from "pg"

import { poolFromUrl, TEST_DATABASE_URL, withRootDb } from "../../helpers"

/*
 * The registry in @app/lib/src/featureFlags.ts and the rows in
 * app_public.feature_flags must name the same features: the migration that
 * adds a feature inserts its row, and removing a flag deletes the registry
 * entry while the row stays, retired, until a later migration deletes it.
 */

const registryKeys = () => [...featureKeys()].sort() as string[]

/*
 * Keys passed as literals to feature_enabled() in function bodies and row
 * level security policies that are neither in the registry nor retired. SQL
 * gates are invisible to the compiler, so this is what catches a gate left
 * behind when a key is removed from the registry.
 */
const findUnregisteredSqlGates = async (client: PoolClient) => {
  const { rows } = await client.query<{ source: string; key: string }>(
    `with sources as (
       select p.oid::regprocedure::text as source, p.prosrc as body
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
       where n.nspname not in ('pg_catalog', 'information_schema')
       union all
       select format('policy %s on %s', pol.polname, pol.polrelid::regclass),
         concat_ws(' ',
           pg_get_expr(pol.polqual, pol.polrelid),
           pg_get_expr(pol.polwithcheck, pol.polrelid))
       from pg_policy as pol
     )
     select distinct s.source, m[1] as key
     from sources as s,
       regexp_matches(s.body, 'feature_enabled\\s*\\(\\s*''([^'']*)''', 'g') as m
     where not exists (
       select 1 from app_public.feature_flags as f
       where f.key = m[1] and f.retired_at is not null
     )
     order by 1, 2`
  )
  const registered = new Set(registryKeys())
  return rows.filter((row) => !registered.has(row.key))
}

describe("feature flag registry", () => {
  it("has a row for every key, and every non-retired row has a key", async () => {
    const { rows } = await poolFromUrl(TEST_DATABASE_URL).query<{
      key: string
    }>(
      "select key from app_public.feature_flags where retired_at is null order by key"
    )
    expect(rows.map((row) => row.key)).toEqual(registryKeys())
  })

  it("has no SQL gate for a key outside the registry", () =>
    withRootDb(async (client) => {
      expect(await findUnregisteredSqlGates(client)).toEqual([])
    }))

  describe("the SQL gate scan", () => {
    it("reports a function that gates on an unknown key", () =>
      withRootDb(async (client) => {
        await client.query(
          `create function app_public.registry_test_gate() returns boolean as $$
             select app_public.feature_enabled( 'registry_test_unknown' )
           $$ language sql stable`
        )
        expect(await findUnregisteredSqlGates(client)).toEqual([
          {
            source: "app_public.registry_test_gate()",
            key: "registry_test_unknown",
          },
        ])
      }))

    it("reports a policy that gates on an unknown key", () =>
      withRootDb(async (client) => {
        await client.query(
          `create table app_public.registry_test_table (id int);
           create policy registry_test_policy on app_public.registry_test_table
             for select using (app_public.feature_enabled('registry_test_policy_key'))`
        )
        expect(await findUnregisteredSqlGates(client)).toEqual([
          {
            source:
              "policy registry_test_policy on app_public.registry_test_table",
            key: "registry_test_policy_key",
          },
        ])
      }))

    it("allows a gate whose flag is retired", () =>
      withRootDb(async (client) => {
        await client.query(
          `insert into app_public.feature_flags (key, description, retired_at)
           values ('registry_test_retired', 'Test flag', now())`
        )
        await client.query(
          `create function app_public.registry_test_gate() returns boolean as $$
             select app_public.feature_enabled('registry_test_retired')
           $$ language sql stable`
        )
        expect(await findUnregisteredSqlGates(client)).toEqual([])
      }))
  })
})
