import { PoolClient } from "pg"

export async function toggleRefreshMaterializedViewTrigger(
  client: PoolClient,
  mode: "enable" | "disable"
) {
  await client.query(
    `alter table app_public.registrations ${mode} trigger _700_refresh_mat_view;
     alter table app_public.events ${mode} trigger _300_refresh_mat_view;
     alter table app_public.quotas ${mode} trigger _300_refresh_mat_view;`
  )
}
