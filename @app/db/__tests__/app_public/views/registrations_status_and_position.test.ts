import { PoolClient } from "pg"

import {
  becomeRoot,
  becomeUser,
  createEventCategories,
  createEvents,
  createOrganizations,
  createQuotas,
  createRegistrations,
  createUsers,
  deleteTestData,
  getJobs,
  poolFromUrl,
  TEST_DATABASE_URL,
  withUserDb,
} from "../../helpers"

/*
 * The statuses and positions of every registration, as defined by the
 * materialized view of migration 000002. The maintained table must always
 * hold exactly these rows.
 */
const REFERENCE_POSITIONS_QUERY = `
  with cte1 as (
    select
      r.id,
      size,
      e.id as event_id,
      q.id as quota_id,
      e.open_quota_size,
      r.created_at,
      row_number() over (partition by r.quota_id order by r.created_at asc) as tmp_pos_quota
    from app_public.registrations r
    left join app_public.quotas q
      on r.quota_id = q.id
    left join app_public.events e
      on r.event_id = e.id
  ), cte2 as (
    select
      tmp.*,
      row_number() over (partition by event_id, tmp_status order by created_at asc) as tmp_pos_status
    from (
      select
        *,
        case
          when tmp_pos_quota <= size then 'IN_QUOTA'::text
          else 'OPEN_OR_QUEUE'::text
        end as tmp_status
      from cte1
    ) as tmp
  ), cte3 as (
    select
      *,
      case
        when tmp_status = 'OPEN_OR_QUEUE'::text and tmp_pos_status <= open_quota_size then 'IN_OPEN_QUOTA'::app_public.registration_status
        when tmp_status = 'OPEN_OR_QUEUE'::text then 'IN_QUEUE'::app_public.registration_status
        else 'IN_QUOTA'::app_public.registration_status
      end as status
    from cte2
  ) select
      id,
      event_id,
      quota_id,
      status,
      case
        when status = 'IN_QUOTA'::app_public.registration_status then cast(row_number() over (partition by quota_id, status order by created_at asc) as integer)
        else cast(row_number() over (partition by event_id, status order by created_at asc) as integer)
      end as position
    from cte3
`

async function setupData(client: PoolClient, opts) {
  const { openQuotaSize, numQuotas, quotaSize } = opts
  const [organization] = await createOrganizations(client, 1)
  const [eventCategory] = await createEventCategories(
    client,
    1,
    organization.id
  )
  const [event] = await createEvents(
    client,
    1,
    organization.id,
    eventCategory.id,
    true, // signupOpen
    false, // isDraft
    openQuotaSize // openQuotaSize
  )
  // 2 quotas with size 1
  const quotas = await createQuotas(client, numQuotas, event.id, quotaSize)
  await becomeRoot(client)
  return { event, quotas }
}

describe("registrations_status_and_position", () => {
  beforeEach(deleteTestData)

  it("SIMPLE CASE: shows correct rank and position for registrations", () =>
    withUserDb(async (client) => {
      // Spots in quotas: 1 + open quota: 1 = total spots: 2
      // Create 3 registrations, one should be in queue

      const { event, quotas } = await setupData(client, {
        openQuotaSize: 1,
        numQuotas: 1,
        quotaSize: 1,
      })
      const registrations = []

      for (let i = 0; i < 3; i++) {
        const [reg] = await createRegistrations(
          client,
          1,
          event.id,
          quotas[0].id,
          []
        )
        // Commit the db transaction to get different timestamps for created_at. It is populated
        // with NOW() which returns the timestamp at the beginning of the transaction.
        await client.query("commit")
        registrations.push(reg)
      }
      const { rows: statusAndPos } = await client.query(
        "select * from app_hidden.registrations_status_and_position"
      )
      const sorted = []
      registrations.forEach((r) => {
        sorted.push(statusAndPos.find((reg) => reg.id === r.id))
      })

      expect(sorted[0].id).toEqual(registrations[0].id)
      expect(sorted[1].id).toEqual(registrations[1].id)
      expect(sorted[2].id).toEqual(registrations[2].id)

      expect(sorted[0].status).toEqual("IN_QUOTA")
      expect(sorted[1].status).toEqual("IN_OPEN_QUOTA")
      expect(sorted[2].status).toEqual("IN_QUEUE")

      expect(sorted[0].position).toEqual(1)
      expect(sorted[1].position).toEqual(1)
      expect(sorted[2].position).toEqual(1)
    }))

  it("COMPLEX CASE: shows correct rank and position for registrations", () =>
    withUserDb(async (client) => {
      // Spots in quotas: 4 + open quota: 2 = total spots: 6
      // Create 10 registrations, 7 for the first quota and 3 for the second quota
      // Both quotas should be filled and 4 people should be in queue

      const { event, quotas } = await setupData(client, {
        openQuotaSize: 2,
        numQuotas: 2,
        quotaSize: 2,
      })

      const registrations = []
      // Fill quota 1 (size 2) and one open spot
      for (let i = 0; i < 7; i++) {
        const [reg] = await createRegistrations(
          client,
          1,
          event.id,
          // First quota
          quotas[0].id,
          []
        )
        // Commit the db transaction to get different timestamps for created_at. It is populated
        // with NOW() which returns the timestamp at the beginning of the transaction.
        await client.query("commit")
        registrations.push(reg)
      }

      // Fill quota 2 (size 2) and one open spot
      for (let i = 0; i < 3; i++) {
        const [reg] = await createRegistrations(
          client,
          1,
          event.id,
          // Second quota
          quotas[1].id,
          []
        )
        // Commit the db transaction to get different timestamps for created_at. It is populated
        // with NOW() which returns the timestamp at the beginning of the transaction.
        await client.query("commit")
        registrations.push(reg)
      }
      const { rows: statusAndPos } = await client.query(
        "select * from app_hidden.registrations_status_and_position"
      )
      const sorted = []
      registrations.forEach((r) => {
        sorted.push(statusAndPos.find((reg) => reg.id === r.id))
      })

      // Check that id's are ordered
      sorted.forEach((s, i) => {
        expect(s.id).toEqual(registrations[i].id)
      })

      // Quota 1
      expect(sorted[0].status).toEqual("IN_QUOTA")
      expect(sorted[1].status).toEqual("IN_QUOTA")
      expect(sorted[2].status).toEqual("IN_OPEN_QUOTA")
      expect(sorted[3].status).toEqual("IN_OPEN_QUOTA")
      expect(sorted[4].status).toEqual("IN_QUEUE")
      expect(sorted[5].status).toEqual("IN_QUEUE")
      expect(sorted[6].status).toEqual("IN_QUEUE")

      expect(sorted[0].position).toEqual(1)
      expect(sorted[1].position).toEqual(2)
      expect(sorted[2].position).toEqual(1)
      expect(sorted[3].position).toEqual(2)
      expect(sorted[4].position).toEqual(1)
      expect(sorted[5].position).toEqual(2)
      expect(sorted[6].position).toEqual(3)

      // Quota 2
      expect(sorted[7].status).toEqual("IN_QUOTA")
      expect(sorted[8].status).toEqual("IN_QUOTA")
      expect(sorted[9].status).toEqual("IN_QUEUE")

      expect(sorted[7].position).toEqual(1)
      expect(sorted[8].position).toEqual(2)
      expect(sorted[9].position).toEqual(4)
    }))

  describe("maintained per event", () => {
    afterAll(deleteTestData)

    // Registers `count` people one transaction at a time so that each
    // registration gets a distinct created_at.
    async function registerInOrder(
      client: PoolClient,
      count: number,
      eventId: string,
      quotaId: string
    ) {
      const registrations = []
      for (let i = 0; i < count; i++) {
        const [reg] = await createRegistrations(client, 1, eventId, quotaId, [])
        await client.query("commit")
        registrations.push(reg)
      }
      return registrations
    }

    async function positionsOf(client: PoolClient, ids: string[]) {
      const { rows } = await client.query(
        `select id, status, position
          from app_hidden.registrations_status_and_position
          where id = any($1::uuid[])`,
        [ids]
      )
      return ids.map((id) => {
        const row = rows.find((r) => r.id === id)
        return row ? { status: row.status, position: row.position } : null
      })
    }

    it("is current right after each registration is inserted", () =>
      withUserDb(async (client) => {
        const { event, quotas } = await setupData(client, {
          openQuotaSize: 0,
          numQuotas: 1,
          quotaSize: 2,
        })
        const registrations = await registerInOrder(
          client,
          3,
          event.id,
          quotas[0].id
        )

        expect(
          await positionsOf(
            client,
            registrations.map((r) => r.id)
          )
        ).toEqual([
          { status: "IN_QUOTA", position: 1 },
          { status: "IN_QUOTA", position: 2 },
          { status: "IN_QUEUE", position: 1 },
        ])
      }))

    it("leaves other events' rows untouched", () =>
      withUserDb(async (client) => {
        const a = await setupData(client, {
          openQuotaSize: 0,
          numQuotas: 1,
          quotaSize: 1,
        })
        const b = await setupData(client, {
          openQuotaSize: 0,
          numQuotas: 1,
          quotaSize: 1,
        })
        await registerInOrder(client, 2, a.event.id, a.quotas[0].id)

        const rowsOfA = async () =>
          (
            await client.query(
              `select id, status, position, xmin::text as xmin
                from app_hidden.registrations_status_and_position
                where event_id = $1
                order by id`,
              [a.event.id]
            )
          ).rows
        const before = await rowsOfA()
        expect(before).toHaveLength(2)

        await registerInOrder(client, 2, b.event.id, b.quotas[0].id)

        expect(await rowsOfA()).toEqual(before)
      }))

    it("recomputes positions when a quota grows", () =>
      withUserDb(async (client) => {
        const { event, quotas } = await setupData(client, {
          openQuotaSize: 0,
          numQuotas: 1,
          quotaSize: 2,
        })
        const registrations = await registerInOrder(
          client,
          3,
          event.id,
          quotas[0].id
        )

        await client.query(
          "update app_public.quotas set size = 3 where id = $1",
          [quotas[0].id]
        )

        expect(await positionsOf(client, [registrations[2].id])).toEqual([
          { status: "IN_QUOTA", position: 3 },
        ])
      }))

    it("recomputes positions when the open quota size changes", () =>
      withUserDb(async (client) => {
        const { event, quotas } = await setupData(client, {
          openQuotaSize: 0,
          numQuotas: 1,
          quotaSize: 1,
        })
        const registrations = await registerInOrder(
          client,
          2,
          event.id,
          quotas[0].id
        )

        await client.query(
          "update app_public.events set open_quota_size = 1 where id = $1",
          [event.id]
        )

        expect(await positionsOf(client, [registrations[1].id])).toEqual([
          { status: "IN_OPEN_QUOTA", position: 1 },
        ])
      }))

    it("enqueues the first queued person when a full quota loses a registration", () =>
      withUserDb(async (client) => {
        const { event, quotas } = await setupData(client, {
          openQuotaSize: 0,
          numQuotas: 1,
          quotaSize: 2,
        })
        const registrations = await registerInOrder(
          client,
          3,
          event.id,
          quotas[0].id
        )

        await client.query(
          "delete from app_public.registrations where id = $1",
          [registrations[1].id]
        )

        const jobs = await getJobs(client, "registration__process_queue")
        expect(jobs).toHaveLength(1)
        expect(jobs[0].payload).toMatchObject({
          receivedSpot: {
            id: registrations[2].id,
            event_id: event.id,
            quota_id: quotas[0].id,
            status: "IN_QUEUE",
            position: 1,
          },
        })
        expect(
          await positionsOf(client, [registrations[0].id, registrations[2].id])
        ).toEqual([
          { status: "IN_QUOTA", position: 1 },
          { status: "IN_QUOTA", position: 2 },
        ])
      }))

    it("enqueues the earliest queued person of the quota when the queue head belongs to another quota", () =>
      withUserDb(async (client) => {
        const {
          event,
          quotas: [quotaA, quotaB],
        } = await setupData(client, {
          openQuotaSize: 0,
          numQuotas: 2,
          quotaSize: 1,
        })
        const [inQuotaA] = await registerInOrder(client, 1, event.id, quotaA.id)
        await registerInOrder(client, 2, event.id, quotaB.id)
        const [queuedA] = await registerInOrder(client, 1, event.id, quotaA.id)

        await client.query(
          "delete from app_public.registrations where id = $1",
          [inQuotaA.id]
        )

        const jobs = await getJobs(client, "registration__process_queue")
        expect(jobs).toHaveLength(1)
        expect(jobs[0].payload).toMatchObject({
          receivedSpot: {
            id: queuedA.id,
            event_id: event.id,
            quota_id: quotaA.id,
            status: "IN_QUEUE",
            position: 2,
          },
        })
      }))

    it("keeps both of two concurrent claims with correct positions", async () => {
      const pool = poolFromUrl(TEST_DATABASE_URL)
      const setupClient = await pool.connect()
      let event, quota
      try {
        await setupClient.query("begin")
        const [user] = await createUsers(setupClient, 1)
        await becomeUser(setupClient, user.id)
        ;({
          event,
          quotas: [quota],
        } = await setupData(setupClient, {
          openQuotaSize: 0,
          numQuotas: 1,
          quotaSize: 5,
        }))
        await setupClient.query("commit")
      } finally {
        await setupClient.query("rollback")
        setupClient.release()
      }

      const client1 = await pool.connect()
      const client2 = await pool.connect()
      try {
        await client1.query("begin")
        await client1.query(
          "select * from app_public.claim_registration_token($1, $2)",
          [event.id, quota.id]
        )

        await client2.query("begin")
        let claim2Done = false
        const claim2 = client2
          .query("select * from app_public.claim_registration_token($1, $2)", [
            event.id,
            quota.id,
          ])
          .then((result) => {
            claim2Done = true
            return result
          })

        // Give the second claim time to reach the per-event lock.
        await new Promise((resolve) => setTimeout(resolve, 300))
        expect(claim2Done).toBe(false)

        await client1.query("commit")
        await claim2
        await client2.query("commit")
      } finally {
        await client1.query("rollback").catch(() => {})
        await client2.query("rollback").catch(() => {})
        client1.release()
        client2.release()
      }

      const { rows } = await pool.query(
        `select status, position
          from app_hidden.registrations_status_and_position
          where event_id = $1
          order by position`,
        [event.id]
      )
      expect(rows).toEqual([
        { status: "IN_QUOTA", position: 1 },
        { status: "IN_QUOTA", position: 2 },
      ])
    })

    it("promotes a registration claimed concurrently with the deletion of a quota spot", async () => {
      const pool = poolFromUrl(TEST_DATABASE_URL)
      const setupClient = await pool.connect()
      let event, quota, firstRegistration
      try {
        await setupClient.query("begin")
        const [user] = await createUsers(setupClient, 1)
        await becomeUser(setupClient, user.id)
        ;({
          event,
          quotas: [quota],
        } = await setupData(setupClient, {
          openQuotaSize: 0,
          numQuotas: 1,
          quotaSize: 1,
        }))
        ;[firstRegistration] = await createRegistrations(
          setupClient,
          1,
          event.id,
          quota.id,
          []
        )
        await setupClient.query("commit")
      } finally {
        await setupClient.query("rollback")
        setupClient.release()
      }

      const client1 = await pool.connect()
      const client2 = await pool.connect()
      let claimedId: string
      try {
        await client1.query("begin")
        await client1.query(
          "select * from app_public.claim_registration_token($1, $2)",
          [event.id, quota.id]
        )
        ;({
          rows: [{ id: claimedId }],
        } = await client1.query(
          "select id from app_public.registrations where event_id = $1 and id <> $2",
          [event.id, firstRegistration.id]
        ))

        await client2.query("begin")
        let deleteDone = false
        const deletion = client2
          .query("delete from app_public.registrations where id = $1", [
            firstRegistration.id,
          ])
          .then((result) => {
            deleteDone = true
            return result
          })

        // Give the deletion time to reach the per-event lock.
        await new Promise((resolve) => setTimeout(resolve, 300))
        expect(deleteDone).toBe(false)

        await client1.query("commit")
        await deletion
        await client2.query("commit")
      } finally {
        await client1.query("rollback").catch(() => {})
        await client2.query("rollback").catch(() => {})
        client1.release()
        client2.release()
      }

      const jobsClient = await pool.connect()
      try {
        const jobs = await getJobs(jobsClient, "registration__process_queue")
        expect(jobs).toHaveLength(1)
        expect(jobs[0].payload).toMatchObject({
          receivedSpot: {
            id: claimedId,
            event_id: event.id,
            quota_id: quota.id,
            status: "IN_QUEUE",
            position: 1,
          },
        })
      } finally {
        jobsClient.release()
      }
    })
  })

  describe("matches the reference definition", () => {
    afterAll(deleteTestData)

    // Rows of the given events that are in the maintained table but not in
    // the reference, and the other way round.
    async function differences(client: PoolClient, eventIds: string[]) {
      const query = (left: string, right: string) =>
        client.query(
          `with reference as (${REFERENCE_POSITIONS_QUERY}),
            maintained as (
              select id, event_id, quota_id, status, position
                from app_hidden.registrations_status_and_position
            )
            select * from ${left} where event_id = any($1::uuid[])
            except
            select * from ${right} where event_id = any($1::uuid[])`,
          [eventIds]
        )
      const [{ rows: onlyMaintained }, { rows: onlyReference }] =
        await Promise.all([
          query("maintained", "reference"),
          query("reference", "maintained"),
        ])
      return { onlyMaintained, onlyReference }
    }

    it("after inserts, deletes and quota and event changes", () =>
      withUserDb(async (client) => {
        const [organization] = await createOrganizations(client, 1)
        const [eventCategory] = await createEventCategories(
          client,
          1,
          organization.id
        )
        const createEvent = async (openQuotaSize: number, sizes: number[]) => {
          const [event] = await createEvents(
            client,
            1,
            organization.id,
            eventCategory.id,
            true,
            false,
            openQuotaSize
          )
          const quotas = []
          for (const [position, size] of sizes.entries()) {
            const {
              rows: [quota],
            } = await client.query(
              `insert into app_public.quotas(event_id, position, title, size)
                values ($1, $2, $3, $4)
                returning *`,
              [event.id, position, { fi: "Kiintiö", en: "Quota" }, size]
            )
            quotas.push(quota)
          }
          return { event, quotas }
        }
        const first = await createEvent(2, [1, 3, 2])
        const second = await createEvent(1, [2, 1])
        await becomeRoot(client)
        const eventIds = [first.event.id, second.event.id]

        const expectMatch = async () =>
          expect(await differences(client, eventIds)).toEqual({
            onlyMaintained: [],
            onlyReference: [],
          })

        // Interleave registrations across events and quotas, one transaction
        // each so that every registration gets a distinct created_at.
        const order = [
          first.quotas[0],
          second.quotas[0],
          first.quotas[1],
          first.quotas[0],
          second.quotas[1],
          first.quotas[2],
          second.quotas[1],
          first.quotas[0],
          second.quotas[0],
          first.quotas[1],
          second.quotas[1],
          first.quotas[0],
          second.quotas[0],
          first.quotas[2],
          first.quotas[2],
          second.quotas[1],
        ]
        const registrations = []
        for (const quota of order) {
          const [registration] = await createRegistrations(
            client,
            1,
            quota.event_id,
            quota.id,
            []
          )
          await client.query("commit")
          registrations.push(registration)
          await expectMatch()
        }

        const deleteRegistration = async (index: number) => {
          await client.query(
            "delete from app_public.registrations where id = $1",
            [registrations[index].id]
          )
          await expectMatch()
        }
        await deleteRegistration(0)
        await deleteRegistration(3)
        await deleteRegistration(11)
        await deleteRegistration(6)

        const setQuotaSize = async (quotaId: string, size: number) => {
          await client.query(
            "update app_public.quotas set size = $2 where id = $1",
            [quotaId, size]
          )
          await expectMatch()
        }
        await setQuotaSize(first.quotas[1].id, 1)
        await setQuotaSize(second.quotas[1].id, 4)
        await setQuotaSize(first.quotas[0].id, 5)

        const setOpenQuotaSize = async (eventId: string, size: number) => {
          await client.query(
            "update app_public.events set open_quota_size = $2 where id = $1",
            [eventId, size]
          )
          await expectMatch()
        }
        await setOpenQuotaSize(first.event.id, 0)
        await setOpenQuotaSize(second.event.id, 3)

        await client.query("delete from app_public.events where id = $1", [
          second.event.id,
        ])
        await expectMatch()
        const {
          rows: [{ count }],
        } = await client.query(
          `select count(*)::int as count
            from app_hidden.registrations_status_and_position
            where event_id = $1`,
          [second.event.id]
        )
        expect(count).toEqual(0)
      }))
  })
})
