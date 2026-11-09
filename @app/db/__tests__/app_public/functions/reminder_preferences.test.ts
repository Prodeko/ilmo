import {
  asRoot,
  becomeUser,
  createEventCategories,
  createEvents,
  createOrganizations,
  createUsers,
  withRootDb,
} from "../../helpers"

it("updates upcoming reminders with saved preferences and keeps preferences private", () =>
  withRootDb(async (client) => {
    const [user, other] = await createUsers(client, 2, true)
    await becomeUser(client, user.id)
    const [organization] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, organization.id)
    const [event, nextEvent] = await createEvents(
      client,
      2,
      organization.id,
      category.id,
      false
    )
    await becomeUser(client, user.id)
    expect(
      (
        await client.query(
          "select * from app_public.current_reminder_preferences()"
        )
      ).rows[0].user_id
    ).toBeNull()
    await client.query(
      "select app_public.save_reminder_preferences(15, 'email')"
    )
    await client.query("select app_public.enable_event_reminder($1, 'fi')", [
      event.id,
    ])
    await client.query(
      "select app_public.save_reminder_preferences(60, 'email')"
    )
    await client.query("select app_public.enable_event_reminder($1, 'en')", [
      nextEvent.id,
    ])
    const { rows } = await client.query(
      "select event_id, minutes_before from app_public.event_registration_reminders"
    )
    expect(rows).toEqual(
      expect.arrayContaining([
        { event_id: event.id, minutes_before: 60 },
        { event_id: nextEvent.id, minutes_before: 60 },
      ])
    )
    await becomeUser(client, other.id)
    expect(
      (await client.query("select * from app_public.reminder_preferences")).rows
    ).toHaveLength(0)
    await client.query(
      "select app_public.save_reminder_preferences(30, 'email')"
    )
    await becomeUser(client, user.id)
    expect(
      (
        await client.query(
          "select * from app_public.current_reminder_preferences()"
        )
      ).rows[0].minutes_before
    ).toBe(60)
  }))

it("requires onboarding before one-click enable", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client, 1, true)
    await becomeUser(client, user.id)
    await expect(
      client.query("select app_public.enable_event_reminder(gen_random_uuid())")
    ).rejects.toHaveProperty("code", "CHECK")
  }))

it.each([0, 10081, null])("rejects invalid default lead time %s", (minutes) =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client, 1, true)
    await becomeUser(client, user.id)
    await expect(
      client.query("select app_public.save_reminder_preferences($1, 'email')", [
        minutes,
      ])
    ).rejects.toHaveProperty("code", "CHECK")
  })
)

it("requires authentication to save preferences", () =>
  withRootDb(async (client) => {
    await becomeUser(client, null)
    await expect(
      client.query("select app_public.save_reminder_preferences(30, 'email')")
    ).rejects.toHaveProperty("code", "LOGIN")
  }))

it("requires email verification", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client, 1, false)
    await becomeUser(client, user.id)
    await expect(
      client.query("select app_public.save_reminder_preferences(30, 'email')")
    ).rejects.toHaveProperty("code", "EMAIL")
  }))

it("requires a connected Telegram account", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client, 1, true)
    await becomeUser(client, user.id)
    await expect(
      client.query(
        "select app_public.save_reminder_preferences(30, 'telegram')"
      )
    ).rejects.toHaveProperty("code", "CHECK")
  }))

it("rechecks delivery availability when enabling with saved preferences", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client, 1, true)
    await becomeUser(client, user.id)
    await asRoot(client, () =>
      client.query(
        "insert into app_public.telegram_accounts(user_id, chat_id) values($1, 123456)",
        [user.id]
      )
    )
    await client.query(
      "select app_public.save_reminder_preferences(30, 'telegram')"
    )
    await client.query("select app_public.disconnect_telegram()")
    await expect(
      client.query("select app_public.enable_event_reminder(gen_random_uuid())")
    ).rejects.toHaveProperty("code", "CHECK")
  }))

it("reschedules pending reminders while preserving sent and past reminders", () =>
  withRootDb(async (client) => {
    const [user] = await createUsers(client, 1, true)
    await becomeUser(client, user.id)
    const [organization] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, organization.id)
    const events = await createEvents(
      client,
      3,
      organization.id,
      category.id,
      false
    )
    await client.query(
      "select app_public.save_reminder_preferences(15, 'email')"
    )
    for (const event of events)
      await client.query("select app_public.enable_event_reminder($1)", [
        event.id,
      ])
    await asRoot(client, async () => {
      await client.query(
        "update app_public.event_registration_reminders set sent_at=now(), email_sent_at=now() where event_id=$1",
        [events[1].id]
      )
      await client.query(
        "update app_public.events set registration_start_time=now()-interval '1 minute' where id=$1",
        [events[2].id]
      )
    })
    await client.query(
      "select app_public.save_reminder_preferences(60, 'email')"
    )
    const { rows } = await client.query(
      "select * from app_public.event_registration_reminders"
    )
    expect(rows.find((r) => r.event_id === events[0].id).minutes_before).toBe(
      60
    )
    expect(rows.find((r) => r.event_id === events[1].id).minutes_before).toBe(
      15
    )
    expect(rows.find((r) => r.event_id === events[2].id).minutes_before).toBe(
      15
    )
    const pending = rows.find((r) => r.event_id === events[0].id)
    await asRoot(client, async () => {
      const jobs = (
        await client.query(
          "select run_at from graphile_worker._private_jobs where key=$1",
          ["registration-reminder:" + pending.id]
        )
      ).rows
      expect(jobs).toHaveLength(1)
      expect(new Date(jobs[0].run_at).getTime()).toBe(
        new Date(events[0].registration_start_time).getTime() - 60 * 60000
      )
    })
  }))

it("updates delivery channels without resending a channel already delivered", () =>
  withRootDb(async (client) => {
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
    await asRoot(client, () =>
      client.query(
        "insert into app_public.telegram_accounts(user_id,chat_id) values($1,123456)",
        [user.id]
      )
    )
    await client.query(
      "select app_public.save_reminder_preferences(15, 'both')"
    )
    await client.query("select app_public.enable_event_reminder($1)", [
      event.id,
    ])
    await asRoot(client, () =>
      client.query(
        "update app_public.event_registration_reminders set email_sent_at=now() where event_id=$1",
        [event.id]
      )
    )
    await client.query(
      "select app_public.save_reminder_preferences(60, 'email')"
    )
    const reminder = (
      await client.query(
        "select * from app_public.event_registration_reminders where event_id=$1",
        [event.id]
      )
    ).rows[0]
    expect(reminder.delivery_method).toBe("email")
    expect(reminder.sent_at).not.toBeNull()
    await asRoot(client, async () => {
      expect(
        (
          await client.query(
            "select key from graphile_worker._private_jobs where key like $1",
            ["registration-reminder:" + reminder.id + "%"]
          )
        ).rows
      ).toHaveLength(0)
    })
  }))

it("does not change another user's reminders when preferences are saved", () =>
  withRootDb(async (client) => {
    const users = await createUsers(client, 2, true)
    await becomeUser(client, users[0].id)
    const [organization] = await createOrganizations(client, 1)
    const [category] = await createEventCategories(client, 1, organization.id)
    const [event] = await createEvents(
      client,
      1,
      organization.id,
      category.id,
      false
    )
    for (const user of users) {
      await becomeUser(client, user.id)
      await client.query(
        "select app_public.save_reminder_preferences(15, 'email')"
      )
      await client.query("select app_public.enable_event_reminder($1)", [
        event.id,
      ])
    }
    await becomeUser(client, users[0].id)
    await client.query(
      "select app_public.save_reminder_preferences(60, 'email')"
    )
    await becomeUser(client, users[1].id)
    const { rows } = await client.query(
      "select minutes_before from app_public.event_registration_reminders"
    )
    expect(rows).toEqual([{ minutes_before: 15 }])
  }))
