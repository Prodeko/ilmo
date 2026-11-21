import { PoolClient } from "pg"

import {
  asRoot,
  becomeUser,
  createEventCategories,
  createEvents,
  createOrganizations,
  createUsers,
  setFeatureFlag,
  withRootDb,
} from "../../helpers"

/*
 * The SQL gates of registration_reminders and telegram_reminders: ways in
 * raise FTOFF while a flag is off, ways out keep working.
 */

async function setup(client: PoolClient) {
  const [user] = await createUsers(client, 1, true)
  await becomeUser(client, user.id)
  const [organization] = await createOrganizations(client, 1)
  const [category] = await createEventCategories(client, 1, organization.id)
  const [event] = await createEvents(
    client,
    1,
    organization.id,
    category.id,
    false
  )
  await asRoot(client, (c) =>
    c.query(
      "insert into app_public.telegram_accounts (user_id, chat_id) values ($1, 4242)",
      [user.id]
    )
  )
  await becomeUser(client, user.id)
  return { user, event }
}

/** Runs the query in a savepoint and returns its error code, or null. */
async function errorCode(client: PoolClient, sql: string, values: any[] = []) {
  await client.query("savepoint gate")
  try {
    await client.query(sql, values)
    await client.query("release savepoint gate")
    return null
  } catch (e) {
    await client.query("rollback to savepoint gate")
    return e.code
  }
}

const enableReminder = (method = "email") => [
  "select app_public.set_event_registration_reminder($1, true, 'fi', 30, $2)",
  method,
]

describe("while registration_reminders is off", () => {
  it("refuses to enable a reminder or save preferences", () =>
    withRootDb(async (client) => {
      const { event } = await setup(client)
      const [sql, method] = enableReminder()
      expect(await errorCode(client, sql, [event.id, method])).toBe("FTOFF")
      expect(
        await errorCode(
          client,
          "select app_public.save_reminder_preferences(30, 'email')"
        )
      ).toBe("FTOFF")
      expect(
        await errorCode(client, "select app_public.enable_event_reminder($1)", [
          event.id,
        ])
      ).toBe("FTOFF")
      const { rows } = await client.query(
        "select * from app_public.event_registration_reminders"
      )
      expect(rows).toEqual([])
    }))

  it("still lets the user cancel a reminder", () =>
    withRootDb(async (client) => {
      const { user, event } = await setup(client)
      await setFeatureFlag(client, "registration_reminders", "on")
      const [sql, method] = enableReminder()
      await client.query(sql, [event.id, method])
      await setFeatureFlag(client, "registration_reminders", "off")

      const {
        rows: [result],
      } = await client.query(
        "select app_public.set_event_registration_reminder($1, false) as enabled",
        [event.id]
      )
      expect(result.enabled).toBe(false)
      const { rows } = await asRoot(client, (c) =>
        c.query(
          "select * from app_public.event_registration_reminders where user_id = $1",
          [user.id]
        )
      )
      expect(rows).toEqual([])
    }))

  it("is on for admins only in admins_only", () =>
    withRootDb(async (client) => {
      const { user, event } = await setup(client)
      await setFeatureFlag(client, "registration_reminders", "admins_only")
      const [sql, method] = enableReminder()
      expect(await errorCode(client, sql, [event.id, method])).toBe("FTOFF")
      await asRoot(client, (c) =>
        c.query("update app_public.users set is_admin = true where id = $1", [
          user.id,
        ])
      )
      expect(await errorCode(client, sql, [event.id, method])).toBeNull()
    }))
})

describe("while telegram_reminders is off", () => {
  it.each(["telegram", "both"])(
    "refuses the %s channel and keeps email",
    (method) =>
      withRootDb(async (client) => {
        const { event } = await setup(client)
        await setFeatureFlag(client, "registration_reminders", "on")
        const [sql] = enableReminder()
        expect(await errorCode(client, sql, [event.id, method])).toBe("FTOFF")
        expect(
          await errorCode(
            client,
            "select app_public.save_reminder_preferences(30, $1)",
            [method]
          )
        ).toBe("FTOFF")
        expect(await errorCode(client, sql, [event.id, "email"])).toBeNull()
        expect(
          await errorCode(
            client,
            "select app_public.save_reminder_preferences(30, 'email')"
          )
        ).toBeNull()
      })
  )

  it("accepts the Telegram channel once the flag is on", () =>
    withRootDb(async (client) => {
      const { event } = await setup(client)
      await setFeatureFlag(client, "registration_reminders", "on")
      await setFeatureFlag(client, "telegram_reminders", "on")
      const [sql] = enableReminder()
      expect(await errorCode(client, sql, [event.id, "both"])).toBeNull()
    }))

  it("refuses a link code and still allows disconnecting", () =>
    withRootDb(async (client) => {
      const { user } = await setup(client)
      expect(
        await errorCode(client, "select app_public.request_telegram_link()")
      ).toBe("FTOFF")
      await client.query("select app_public.disconnect_telegram()")
      const { rows } = await asRoot(client, (c) =>
        c.query(
          "select * from app_public.telegram_accounts where user_id = $1",
          [user.id]
        )
      )
      expect(rows).toEqual([])
    }))
})
