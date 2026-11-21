import { PoolClient } from "pg"

const REGISTRATION_POSITION_TRIGGERS = [
  ["app_public.registrations", "_700_refresh_registration_positions"],
  ["app_public.registrations", "_701_refresh_registration_positions"],
  ["app_public.events", "_300_refresh_registration_positions"],
  ["app_public.events", "_301_refresh_registration_positions"],
  ["app_public.quotas", "_300_refresh_registration_positions"],
  ["app_public.quotas", "_301_refresh_registration_positions"],
]

/*
 * Bulk changes recompute registration positions once per changed row. Disable
 * the triggers around a bulk change and call refreshRegistrationPositions
 * afterwards to recompute every event once.
 */
export async function toggleRegistrationPositionTriggers(
  client: PoolClient,
  mode: "enable" | "disable"
) {
  await client.query(
    REGISTRATION_POSITION_TRIGGERS.map(
      ([table, trigger]) => `alter table ${table} ${mode} trigger ${trigger};`
    ).join("\n")
  )
}

export async function refreshRegistrationPositions(client: PoolClient) {
  await client.query(
    `delete from app_hidden.registrations_status_and_position
       where id not in (select id from app_public.registrations);
     select app_private.refresh_registration_positions(id) from app_public.events;`
  )
}
