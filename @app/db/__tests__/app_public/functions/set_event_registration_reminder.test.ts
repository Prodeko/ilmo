import { PoolClient } from "pg"

import reminderTask from "../../../../worker/src/tasks/reminder__send_registration"
import sendEmail from "../../../../worker/src/tasks/send_email"
import {
  asRoot,
  becomeUser,
  createEventCategories,
  createEvents,
  createOrganizations,
  createUsers,
  withRootDb,
} from "../../helpers"

jest.mock("../../../../worker/src/tasks/send_email", () => ({
  __esModule: true,
  default: jest.fn(),
}))

async function setup(client: PoolClient, verified = true) {
  const [user] = await createUsers(client, 1, verified)
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
  await becomeUser(client, user.id)
  return { user, event }
}

async function enable(client: PoolClient, eventId: string) {
  await client.query(
    "select app_public.set_event_registration_reminder($1, true, 'fi')",
    [eventId]
  )
  return (
    await client.query(
      "select * from app_public.event_registration_reminders where event_id = $1",
      [eventId]
    )
  ).rows[0]
}

async function jobs(client: PoolClient, id: string) {
  return asRoot(
    client,
    async () =>
      (
        await client.query(
          "select * from graphile_worker._private_jobs where key = $1",
          [`registration-reminder:${id}`]
        )
      ).rows
  )
}

it("stores one reminder per user/event, scheduled exactly 30 minutes before opening", () =>
  withRootDb(async (client) => {
    const { event } = await setup(client)
    const reminder = await enable(client, event.id)
    await enable(client, event.id)
    expect(
      (
        await client.query(
          "select * from app_public.event_registration_reminders"
        )
      ).rows
    ).toHaveLength(1)
    const scheduled = await jobs(client, reminder.id)
    expect(scheduled).toHaveLength(1)
    expect(new Date(scheduled[0].run_at).getTime()).toBe(
      new Date(event.registration_start_time).getTime() - 30 * 60000
    )
  }))

it("isolates reminders between users and permits cancellation only by their owner", () =>
  withRootDb(async (client) => {
    const { user, event } = await setup(client)
    const reminder = await enable(client, event.id)
    const [other] = await asRoot(client, () => createUsers(client))
    await becomeUser(client, other.id)
    expect(
      (
        await client.query(
          "select * from app_public.event_registration_reminders"
        )
      ).rows
    ).toHaveLength(0)
    await client.query(
      "select app_public.set_event_registration_reminder($1, false)",
      [event.id]
    )
    expect(await jobs(client, reminder.id)).toHaveLength(1)
    await becomeUser(client, user.id)
    await client.query(
      "select app_public.set_event_registration_reminder($1, false)",
      [event.id]
    )
    expect(await jobs(client, reminder.id)).toHaveLength(0)
  }))

it("requires a signed-in user", () =>
  withRootDb(async (client) => {
    const { event } = await setup(client)
    await becomeUser(client, null)
    await expect(enable(client, event.id)).rejects.toHaveProperty(
      "code",
      "LOGIN"
    )
  }))

it("requires a verified primary email", () =>
  withRootDb(async (client) => {
    const { event } = await setup(client, false)
    await expect(enable(client, event.id)).rejects.toHaveProperty(
      "code",
      "EMAIL"
    )
  }))

it.each(["hidden", "open"])("rejects an %s event", (kind) =>
  withRootDb(async (client) => {
    const { event } = await setup(client)
    await asRoot(client, () =>
      client.query(
        kind === "hidden"
          ? "update app_public.events set is_draft = true where id = $1"
          : "update app_public.events set registration_start_time = now() - interval '1 minute' where id = $1",
        [event.id]
      )
    )
    await expect(enable(client, event.id)).rejects.toHaveProperty(
      "code",
      "CLOSD"
    )
  })
)

it("reschedules pending reminders, pauses hidden events and removes deleted events' jobs", () =>
  withRootDb(async (client) => {
    const { event } = await setup(client)
    const reminder = await enable(client, event.id)
    await asRoot(client, () =>
      client.query(
        "update app_public.events set registration_start_time = registration_start_time + interval '1 hour' where id = $1",
        [event.id]
      )
    )
    const scheduled = await jobs(client, reminder.id)
    expect(new Date(scheduled[0].run_at).getTime()).toBe(
      new Date(event.registration_start_time).getTime() + 30 * 60000
    )
    await asRoot(client, () =>
      client.query(
        "update app_public.events set is_draft = true where id = $1",
        [event.id]
      )
    )
    expect(await jobs(client, reminder.id)).toHaveLength(0)
    await asRoot(client, () =>
      client.query(
        "update app_public.events set is_draft = false where id = $1",
        [event.id]
      )
    )
    expect(await jobs(client, reminder.id)).toHaveLength(1)
    await asRoot(client, () =>
      client.query("delete from app_public.events where id = $1", [event.id])
    )
    expect(await jobs(client, reminder.id)).toHaveLength(0)
    expect(
      (
        await client.query(
          "select * from app_public.event_registration_reminders"
        )
      ).rows
    ).toHaveLength(0)
  }))

it("schedules immediately inside the 30-minute window", () =>
  withRootDb(async (client) => {
    const { event } = await setup(client)
    await asRoot(client, () =>
      client.query(
        "update app_public.events set registration_start_time = now() + interval '10 minutes' where id = $1",
        [event.id]
      )
    )
    const reminder = await enable(client, event.id)
    const scheduled = await jobs(client, reminder.id)
    const {
      rows: [row],
    } = await client.query("select now() as now")
    expect(new Date(scheduled[0].run_at).getTime()).toBe(
      new Date(row.now).getTime()
    )
  }))

it("delivers a due reminder once using real database locks and the verified primary email", () =>
  withRootDb(async (client) => {
    const { event, user } = await setup(client)
    await asRoot(client, () =>
      client.query(
        "update app_public.events set registration_start_time = now() + interval '40 minutes' where id = $1",
        [event.id]
      )
    )
    await client.query(
      "select app_public.set_event_registration_reminder($1, true, 'fi', 60)",
      [event.id]
    )
    const reminder = (
      await client.query(
        "select * from app_public.event_registration_reminders where event_id = $1",
        [event.id]
      )
    ).rows[0]
    jest.mocked(sendEmail).mockResolvedValue(undefined)
    process.env.ROOT_URL = "https://example.com"
    const deliveryClient = {
      query: (sql: string, args?: unknown[]) =>
        client.query(
          sql === "begin"
            ? "savepoint reminder_delivery"
            : sql === "commit"
              ? "release savepoint reminder_delivery"
              : sql === "rollback"
                ? "rollback to savepoint reminder_delivery"
                : sql,
          args
        ),
    }
    const helpers = {
      withPgClient: async (callback) => callback(deliveryClient),
    }
    await asRoot(client, async () => {
      await reminderTask({ id: reminder.id }, helpers as any)
      await reminderTask({ id: reminder.id }, helpers as any)
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((jest.mocked(sendEmail).mock.calls[0][0] as any).options.to).toBe(
      user._email
    )
    expect(
      (
        await client.query(
          "select sent_at from app_public.event_registration_reminders where id = $1",
          [reminder.id]
        )
      ).rows[0].sent_at
    ).not.toBeNull()
  }))

it("updates the lead time and reschedules the existing reminder", () =>
  withRootDb(async (client) => {
    const { event } = await setup(client)
    const reminder = await enable(client, event.id)
    await client.query(
      "select app_public.set_event_registration_reminder($1, true, 'en', 60)",
      [event.id]
    )
    const rows = (
      await client.query(
        "select * from app_public.event_registration_reminders"
      )
    ).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: reminder.id,
      minutes_before: 60,
      language: "en",
    })
    expect(
      new Date((await jobs(client, reminder.id))[0].run_at).getTime()
    ).toBe(new Date(event.registration_start_time).getTime() - 60 * 60000)
  }))

it.each([0, -1, 10081, null])(
  "rejects invalid reminder lead time %s",
  (minutes) =>
    withRootDb(async (client) => {
      const { event } = await setup(client)
      await expect(
        client.query(
          "select app_public.set_event_registration_reminder($1, true, 'fi', $2)",
          [event.id, minutes]
        )
      ).rejects.toHaveProperty("code", "CHECK")
    })
)

it.each([
  "reminder removed",
  "account deleted",
  "event deleted",
  "organization deleted",
  "event hidden",
  "primary email removed",
  "primary email unverified",
  "registration opened",
])("does not deliver an old queued job after %s", (scenario) =>
  withRootDb(async (client) => {
    const fixture = await setup(client)
    const event = fixture.event
    const user =
      scenario === "account deleted"
        ? (await asRoot(client, () => createUsers(client)))[0]
        : fixture.user
    await becomeUser(client, user.id)
    await asRoot(client, () =>
      client.query(
        "update app_public.events set registration_start_time = now() + interval '10 minutes' where id = $1",
        [event.id]
      )
    )
    const reminder = await enable(client, event.id)
    jest.mocked(sendEmail).mockClear()
    await asRoot(client, async () => {
      switch (scenario) {
        case "reminder removed":
          await client.query(
            "delete from app_public.event_registration_reminders where id = $1",
            [reminder.id]
          )
          break
        case "account deleted":
          await client.query(
            "update app_public.organization_memberships set is_owner = false where user_id = $1",
            [user.id]
          )
          await client.query("delete from app_public.users where id = $1", [
            user.id,
          ])
          break
        case "event deleted":
          await client.query("delete from app_public.events where id = $1", [
            event.id,
          ])
          break
        case "organization deleted":
          await client.query(
            "delete from app_public.organizations where id = $1",
            [event.owner_organization_id]
          )
          break
        case "event hidden":
          await client.query(
            "update app_public.events set is_draft = true where id = $1",
            [event.id]
          )
          break
        case "primary email removed":
          await client.query(
            "insert into app_public.user_emails (user_id, email, is_verified) values ($1, 'backup-reminder@example.com', true)",
            [user.id]
          )
          await client.query(
            "delete from app_public.user_emails where user_id = $1 and is_primary",
            [user.id]
          )
          break
        case "primary email unverified":
          await client.query(
            "update app_public.user_emails set is_verified = false, is_primary = false where user_id = $1",
            [user.id]
          )
          break
        case "registration opened":
          await client.query(
            "update app_public.events set registration_start_time = now() - interval '1 minute' where id = $1",
            [event.id]
          )
          break
      }
      if (
        [
          "reminder removed",
          "account deleted",
          "event deleted",
          "organization deleted",
        ].includes(scenario)
      ) {
        expect(
          (
            await client.query(
              "select id from app_public.event_registration_reminders where id = $1",
              [reminder.id]
            )
          ).rows
        ).toHaveLength(0)
        expect(await jobs(client, reminder.id)).toHaveLength(0)
      }
      const deliveryClient = {
        query: (sql: string, args?: unknown[]) =>
          client.query(
            sql === "begin"
              ? "savepoint skipped_reminder"
              : sql === "commit"
                ? "release savepoint skipped_reminder"
                : sql === "rollback"
                  ? "rollback to savepoint skipped_reminder"
                  : sql,
            args
          ),
      }
      await reminderTask({ id: reminder.id }, {
        withPgClient: async (callback) => callback(deliveryClient),
      } as any)
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })
)
