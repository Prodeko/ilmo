import { PoolClient } from "pg"

import { processTelegramUpdate } from "../../../../server/src/telegram"
import {
  asRoot,
  becomeUser,
  createEventCategories,
  createEvents,
  createOrganizations,
  createUsers,
  withRootDb,
} from "../../helpers"

async function link(client: PoolClient, chatId = 12345) {
  const token = (
    await client.query("select app_public.request_telegram_link() as token")
  ).rows[0].token
  const result = await asRoot(client, () =>
    client.query(
      "select app_private.connect_telegram($1, $2, 'tester') as connected",
      [token, chatId]
    )
  )
  expect(result.rows[0].connected).toBe(true)
  return token
}

it("requires login to request a linking code", () =>
  withRootDb(async (client) => {
    await becomeUser(client, null)
    await expect(
      client.query("select app_public.request_telegram_link()")
    ).rejects.toHaveProperty("code", "LOGIN")
  }))
it("stores only a hash, consumes codes once, and isolates accounts", () =>
  withRootDb(async (client) => {
    const [user, other] = await createUsers(client, 2)
    await becomeUser(client, user.id)
    const token = await link(client)
    expect(token).toMatch(/^[a-f0-9]{48}$/)
    expect(
      (
        await client.query(
          "select * from app_public.current_telegram_account()"
        )
      ).rows[0].username
    ).toBe("tester")
    const again = await asRoot(client, () =>
      client.query(
        "select app_private.connect_telegram($1, 12345, 'tester') as connected",
        [token]
      )
    )
    expect(again.rows[0].connected).toBe(false)
    await becomeUser(client, other.id)
    expect(
      (await client.query("select * from app_public.telegram_accounts")).rows
    ).toHaveLength(0)
    await expect(
      client.query("select * from app_private.telegram_link_tokens")
    ).rejects.toHaveProperty("code", "42501")
  }))
it("expires and replaces linking codes", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client)
    await becomeUser(client, user.id)
    const old = (
      await client.query("select app_public.request_telegram_link() as token")
    ).rows[0].token
    const token = (
      await client.query("select app_public.request_telegram_link() as token")
    ).rows[0].token
    await asRoot(client, async () => {
      expect(
        (
          await client.query(
            "select app_private.connect_telegram($1, 12345, null) as connected",
            [old]
          )
        ).rows[0].connected
      ).toBe(false)
      await client.query(
        "update app_private.telegram_link_tokens set expires_at = now() - interval '1 minute' where user_id = $1",
        [user.id]
      )
      expect(
        (
          await client.query(
            "select app_private.connect_telegram($1, 12345, null) as connected",
            [token]
          )
        ).rows[0].connected
      ).toBe(false)
    })
  }))
it("does not transfer a Telegram chat between Ilmo accounts", () =>
  withRootDb(async (client) => {
    const [first, second] = await createUsers(client, 2)
    await becomeUser(client, first.id)
    await link(client)
    await becomeUser(client, second.id)
    const token = (
      await client.query("select app_public.request_telegram_link() as token")
    ).rows[0].token
    await asRoot(client, async () => {
      expect(
        (
          await client.query(
            "select app_private.connect_telegram($1, 12345, null) as connected",
            [token]
          )
        ).rows[0].connected
      ).toBe(false)
      expect(
        (
          await client.query(
            "select user_id from app_public.telegram_accounts where chat_id = 12345"
          )
        ).rows[0].user_id
      ).toBe(first.id)
    })
  }))
it("schedules both channels and disconnecting preserves only email", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client)
    await becomeUser(client, user.id)
    const [org] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, org.id)
    const [event] = await createEvents(client, 1, org.id, category.id, false)
    await link(client)
    await client.query(
      "select app_public.set_event_registration_reminder($1, true, 'fi', 30, 'both')",
      [event.id]
    )
    const reminder = (
      await client.query(
        "select * from app_public.event_registration_reminders where event_id = $1",
        [event.id]
      )
    ).rows[0]
    await asRoot(client, async () => {
      const jobs = (
        await client.query(
          "select key from graphile_worker._private_jobs where key like $1",
          [`registration-reminder:${reminder.id}%`]
        )
      ).rows
      expect(jobs).toHaveLength(2)
    })
    await client.query("select app_public.disconnect_telegram()")
    expect(
      (
        await client.query(
          "select * from app_public.event_registration_reminders where id = $1",
          [reminder.id]
        )
      ).rows[0].delivery_method
    ).toBe("email")
    await asRoot(client, async () => {
      expect(
        (
          await client.query(
            "select key from graphile_worker._private_jobs where key = $1",
            [`registration-reminder:${reminder.id}:telegram`]
          )
        ).rows
      ).toHaveLength(0)
    })
  }))
it("deduplicates /start updates and ignores commands in groups", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client)
    await becomeUser(client, user.id)
    const token = (
      await client.query("select app_public.request_telegram_link() as token")
    ).rows[0].token
    await asRoot(client, async () => {
      const update = {
        update_id: 1024,
        message: {
          text: `/start ${token}`,
          chat: { type: "private", id: 12345 },
          from: { id: 12345, username: "tester" },
        },
      }
      await processTelegramUpdate(client, {
        ...update,
        message: { ...update.message, chat: { type: "group", id: -12345 } },
      })
      expect(
        (
          await client.query(
            "select * from app_public.telegram_accounts where user_id = $1",
            [user.id]
          )
        ).rows
      ).toHaveLength(0)
      const valid = { ...update, update_id: 1025 }
      await processTelegramUpdate(client, valid)
      await processTelegramUpdate(client, valid)
      expect(
        (
          await client.query(
            "select * from app_public.telegram_accounts where user_id = $1",
            [user.id]
          )
        ).rows
      ).toHaveLength(1)
      expect(
        (
          await client.query(
            "select * from graphile_worker._private_jobs j join graphile_worker._private_tasks t on j.task_id = t.id where t.identifier = 'telegram__reply'"
          )
        ).rows
      ).toHaveLength(1)
      await processTelegramUpdate(client, {
        update_id: 1026,
        message: {
          text: "/stop",
          chat: { id: 12345, type: "private" },
          from: { id: 12345 },
        },
      })
      expect(
        (
          await client.query(
            "select * from app_public.telegram_accounts where user_id = $1",
            [user.id]
          )
        ).rows
      ).toHaveLength(0)
    })
  }))

it("allows Telegram-only reminders without a verified email and removes them on disconnect", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client, 1, false)
    await becomeUser(client, user.id)
    const [org] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, org.id)
    const [event] = await createEvents(client, 1, org.id, category.id, false)
    await link(client)
    await client.query(
      "select app_public.set_event_registration_reminder($1, true, 'fi', 30, 'telegram')",
      [event.id]
    )
    const reminder = (
      await client.query(
        "select * from app_public.event_registration_reminders where event_id = $1",
        [event.id]
      )
    ).rows[0]
    await client.query("select app_public.disconnect_telegram()")
    expect(
      (
        await client.query(
          "select id from app_public.event_registration_reminders where id = $1",
          [reminder.id]
        )
      ).rows
    ).toHaveLength(0)
    await asRoot(client, async () => {
      expect(
        (
          await client.query(
            "select key from graphile_worker._private_jobs where key like $1",
            [`registration-reminder:${reminder.id}%`]
          )
        ).rows
      ).toHaveLength(0)
    })
  }))
it("rejects Telegram delivery until the user links a chat", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client)
    await becomeUser(client, user.id)
    const [org] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, org.id)
    const [event] = await createEvents(client, 1, org.id, category.id, false)
    await expect(
      client.query(
        "select app_public.set_event_registration_reminder($1, true, 'fi', 30, 'telegram')",
        [event.id]
      )
    ).rejects.toHaveProperty("code", "CHECK")
  }))
it("marks a partially delivered both reminder complete when switched to the delivered channel", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client)
    await becomeUser(client, user.id)
    const [org] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, org.id)
    const [event] = await createEvents(client, 1, org.id, category.id, false)
    await link(client)
    await client.query(
      "select app_public.set_event_registration_reminder($1, true, 'fi', 30, 'both')",
      [event.id]
    )
    await asRoot(client, () =>
      client.query(
        "update app_public.event_registration_reminders set email_sent_at = now() where event_id = $1",
        [event.id]
      )
    )
    await client.query(
      "select app_public.set_event_registration_reminder($1, true, 'fi', 30, 'email')",
      [event.id]
    )
    expect(
      (
        await client.query(
          "select sent_at from app_public.event_registration_reminders where event_id = $1",
          [event.id]
        )
      ).rows[0].sent_at
    ).not.toBeNull()
  }))
it("removes a deleted subscriber's link, tokens, reminders and both jobs", () =>
  withRootDb(async (client) => {
    const [owner, subscriber] = await createUsers(client, 2)
    await becomeUser(client, owner.id)
    const [org] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, org.id)
    const [event] = await createEvents(client, 1, org.id, category.id, false)
    await becomeUser(client, subscriber.id)
    await link(client)
    await client.query("select app_public.request_telegram_link()")
    await client.query(
      "select app_public.set_event_registration_reminder($1, true, 'fi', 30, 'both')",
      [event.id]
    )
    const reminder = (
      await client.query(
        "select id from app_public.event_registration_reminders where event_id = $1",
        [event.id]
      )
    ).rows[0]
    await asRoot(client, async () => {
      await client.query("delete from app_public.users where id = $1", [
        subscriber.id,
      ])
      for (const table of [
        "app_public.telegram_accounts",
        "app_private.telegram_link_tokens",
        "app_public.event_registration_reminders",
      ]) {
        expect(
          (
            await client.query(
              `select user_id from ${table} where user_id = $1`,
              [subscriber.id]
            )
          ).rows
        ).toHaveLength(0)
      }
      expect(
        (
          await client.query(
            "select key from graphile_worker._private_jobs where key like $1",
            [`registration-reminder:${reminder.id}%`]
          )
        ).rows
      ).toHaveLength(0)
    })
  }))
