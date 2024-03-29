import { IncomingMessage, Server, ServerResponse } from "http"
import { ParsedUrlQuery } from "querystring"

import {
  Event,
  EventCategory,
  EventQuestion,
  Organization,
  Quota,
  Registration,
  User,
} from "@app/graphql"
import { RegistrationSecret, Session } from "@app/lib"
import dayjs from "dayjs"
import faker from "faker"
import {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  RouteHandlerMethod,
} from "fastify"
import fp from "fastify-plugin"
import { Pool, PoolClient } from "pg"
import slugify from "slugify"

import type { RouteGenericInterface } from "fastify/types/route"
import type { SnakeCasedProperties } from "type-fest"

const paragraph = () => faker.lorem.paragraph()
const word = () => faker.lorem.word()
const words = () => faker.lorem.words()

const CypressServerCommands: FastifyPluginAsync = async (app) => {
  // Only enable this in test/development mode
  if (!["test", "development"].includes(process.env.NODE_ENV || "")) {
    throw new Error("This code must not run in production")
  }

  /*
   * Furthermore we require the `ENABLE_CYPRESS_COMMANDS` environmental variable
   * to be set; this gives us extra protection against accidental XSS/CSRF
   * attacks.
   */
  const safeToRun = process.env.ENABLE_CYPRESS_COMMANDS === "1"
  const rootPgPool = app.rootPgPool

  /*
   * This function is invoked for the /cypressServerCommand route and is
   * responsible for parsing the request and handing it off to the relevant
   * function.
   */
  const handleCypressServerCommand: RouteHandlerMethod<
    Server,
    IncomingMessage,
    ServerResponse,
    RouteGenericInterface,
    unknown
  > = async (req: FastifyRequest, res: FastifyReply) => {
    /*
     * If we didn't set ENABLE_CYPRESS_COMMANDS, output a warning to the server
     * log, and then pretend the /cypressServerCommand route doesn't exist.
     */
    if (!safeToRun) {
      console.error(
        "/cypressServerCommand denied because ENABLE_CYPRESS_COMMANDS is not set."
      )
      // Pretend like nothing happened
      return null
    }

    try {
      // Try to read and parse the commands from the request.
      const { query } = req
      if (!query) {
        throw new Error("Query not specified")
      }

      const { command: rawCommand, payload: rawPayload } =
        query as ParsedUrlQuery
      if (!rawCommand) {
        throw new Error("Command not specified")
      }

      const command = String(rawCommand)
      const payload = rawPayload ? JSON.parse(String(rawPayload)) : {}

      // Now run the actual command:
      const result = await runCommand(req, res, rootPgPool, command, payload)

      if (result === null || command === "login") {
        /*
         * When a command returns null, we assume they've handled sending the
         * response. This allows commands to do things like redirect to new
         * pages when they're done.
         */
        res.redirect(204, payload.next || "/")
      } else {
        /*
         * The command returned a result, send it back to the test suite.
         */
        res
          .code(200)
          .header("Content-Type", "application/json; charset=utf-8")
          .send(result)
      }
    } catch (e) {
      /*
       * If anything goes wrong, let the test runner know so that it can fail
       * the test.
       */
      console.error("cypressServerCommand failed!")
      console.error(e)
      res.status(500).serialize({
        error: {
          message: e.message,
          stack: e.stack,
        },
      })
    }
  }
  app.get("/cypressServerCommand", {}, handleCypressServerCommand)
}

async function runCommand(
  req: FastifyRequest,
  res: FastifyReply,
  rootPgPool: Pool,
  command: string,
  payload: { [key: string]: any }
): Promise<object | null> {
  if (command === "clearTestUsers") {
    await rootPgPool.query(
      `delete from app_public.users where username like 'testuser%';
       delete from app_private.sessions;`
    )
    return { success: true }
  } else if (command === "clearTestOrganizations") {
    await rootPgPool.query(
      "delete from app_public.organizations where slug like 'test%'"
    )
    return { success: true }
  } else if (command === "clearTestEventData") {
    await rootPgPool.query(
      `delete from app_private.registration_secrets;
      delete from app_public.registrations;
      delete from app_public.quotas;
      delete from app_public.events;
      delete from app_public.event_categories;
      delete from app_public.event_questions;
      delete from app_public.organizations;

      -- Delete graphile worker jobs
      delete from graphile_worker.jobs;`
    )
    return { success: true }
  } else if (command === "createUser") {
    if (!payload) {
      throw new Error("Payload required")
    }

    const {
      username = "testuser",
      email = `${username}@example.com`,
      name = username,
      avatarUrl = null,
      password = "TestUserPassword",
      verified = false,
      isAdmin = false,
    } = payload

    if (!username.startsWith("testuser")) {
      throw new Error("Test user usernames may only start with 'testuser'")
    }

    const user = await reallyCreateUser(rootPgPool, {
      username,
      email,
      name,
      avatarUrl,
      password,
      verified,
      isAdmin,
    })

    let verificationToken: string | null = null
    const userEmailSecrets = await getUserEmailSecrets(rootPgPool, email)
    const userEmailId: string = userEmailSecrets.user_email_id

    if (!verified) {
      verificationToken = userEmailSecrets.verification_token
    }

    return { user, userEmailId, verificationToken }
  } else if (command === "login") {
    const {
      username = "testuser",
      email = `${username}@example.com`,
      name = username,
      avatarUrl = null,
      password = "TestUserPassword",
      orgs = [],
      verified = false,
      isAdmin = false,
      existingUser = false,
    } = payload
    const client = await rootPgPool.connect()

    let user: SnakeCasedProperties<User>,
      otherUser: SnakeCasedProperties<User>,
      session: any,
      otherSession: any

    if (existingUser) {
      const { rows } = await client.query(
        "select * from app_private.login($1, $2)",
        [username, password]
      )
      ;[session] = rows
    } else {
      user = await reallyCreateUser(rootPgPool, {
        username,
        email,
        name,
        avatarUrl,
        password,
        verified,
        isAdmin,
      })
      otherUser = await reallyCreateUser(rootPgPool, {
        username: "testuser_other",
        email: "testuser_other@example.com",
        name: "testuser_other",
        password: "DOESNT MATTER",
        verified: true,
        isAdmin: true,
      })
      session = await createSession(rootPgPool, user.id)
      otherSession = await createSession(rootPgPool, otherUser.id)
    }

    try {
      await client.query("begin")
      try {
        await setSession(client, session)
        await Promise.all(
          orgs.map(
            async ([name, slug, owner = true]: [string, string, boolean?]) => {
              if (!owner) {
                await setSession(client, otherSession)
              }
              const {
                rows: [organization],
              } = await client.query(
                "select * from app_public.create_organization($1, $2, $3)",
                [slug, name, "#ffffff"]
              )
              if (!owner) {
                await client.query(
                  "select app_public.invite_to_organization($1::uuid, $2::citext, null::citext)",
                  [organization.id, user.username]
                )
                await setSession(client, session)
                await client.query(
                  `select app_public.accept_invitation_to_organization(organization_invitations.id)
                   from app_public.organization_invitations
                   where user_id = $1`,
                  [user.id]
                )
              }
            }
          )
        )
      } finally {
        await client.query("commit")
      }
    } finally {
      client.release()
    }

    await req.logIn({ sessionId: session.uuid })

    return null
  } else if (command === "createTestEventData") {
    return createEventData(rootPgPool, payload)
  } else if (command === "getEmailSecrets") {
    const { email = "test.user@example.com" } = payload
    const userEmailSecrets = await getUserEmailSecrets(rootPgPool, email)
    return userEmailSecrets
  } else if (command === "createRegistrations") {
    const { eventId, quotaId, count = 1 } = payload
    const client = await rootPgPool.connect()
    const registrations = await createRegistrations(
      client,
      count,
      eventId,
      quotaId,
      []
    )
    return registrations
  } else {
    throw new Error(`Command '${command}' not understood.`)
  }
}

async function setSession(client: PoolClient, sess: any) {
  await client.query("select set_config('jwt.claims.session_id', $1, true)", [
    sess.uuid,
  ])
}

async function reallyCreateUser(
  rootPgPool: Pool,
  {
    username,
    email,
    name,
    avatarUrl,
    password,
    verified,
    isAdmin,
  }: {
    username?: string
    email?: string
    name?: string
    avatarUrl?: string
    password?: string
    verified?: boolean
    isAdmin?: boolean
  }
): Promise<SnakeCasedProperties<User>> {
  const {
    rows: [user],
  } = await rootPgPool.query(
    `select * from app_private.really_create_user(
      username := $1,
      email := $2,
      name := $3,
      avatar_url := $4,
      password := $5,
      email_is_verified := $6,
      is_admin := $7
    )`,
    [username, email, name, avatarUrl, password, verified, isAdmin]
  )
  return user
}

async function createEventData(
  rootPgPool: Pool,
  payload: { [key: string]: any }
) {
  const client = await rootPgPool.connect()
  const {
    eventSignupUpcoming = false,
    eventSignupClosed = false,
    userIsAdmin = false,
    openQuotaSize = 0,
    quotaSize = 5,
  } = payload

  try {
    await client.query("begin")

    const user = await reallyCreateUser(rootPgPool, {
      username: "testuser",
      email: "testuser@example.com",
      name: "testuser",
      password: "DOESNT MATTER",
      verified: true,
      isAdmin: userIsAdmin,
    })
    const session = await createSession(rootPgPool, user.id)

    await setSession(client, session)

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
      eventSignupUpcoming,
      eventSignupClosed,
      openQuotaSize
    )
    const [quota] = await createQuotas(client, 1, event.id, quotaSize)
    const [question] = await createQuestions(client, 1, event.id, false)
    let registration, registrationSecret
    if (!eventSignupClosed && !eventSignupUpcoming) {
      // Database trigger prevents creating registrations for events that are
      // closed or their signup is upcoming
      ;[registration] = await createRegistrations(
        client,
        1,
        event.id,
        quota.id,
        [question]
      )
      ;[registrationSecret] = await createRegistrationSecrets(
        client,
        [registration],
        event.id,
        quota.id
      )
    }

    await client.query("commit")
    return {
      user,
      organization,
      eventCategory,
      event,
      quota,
      question,
      registration,
      registrationSecret,
    }
  } finally {
    client.release()
  }
}

/******************************************************************************/
// Organizations

export const createOrganizations = async (
  client: PoolClient,
  count: number = 1
) => {
  const organizations: SnakeCasedProperties<Organization>[] = []
  for (let i = 0; i < count; i++) {
    const random = words()
    const slug = slugify(`organization-${random}`)
    const name = `Organization ${random}`
    const color = faker.internet.color()

    // Become root to bypass RLS policies
    await client.query("reset role")

    const {
      rows: [organization],
    } = await client.query(
      `with new_org as(
          insert into app_public.organizations (slug, name, color)
            values ($1, $2, $3)
            returning *
        ), new_membership as (
          insert into app_public.organization_memberships (organization_id, user_id, is_owner)
            select new_org.id, app_public.current_user_id(), true from new_org
          returning *
        )
        select * from new_org;
      `,
      [slug, name, color]
    )
    organizations.push(organization)
  }

  return organizations
}

/******************************************************************************/
// Event categories

export const createEventCategories = async (
  client: PoolClient,
  count: number = 1,
  organizationId: string
) => {
  const categories: SnakeCasedProperties<EventCategory>[] = []
  for (let i = 0; i < count; i++) {
    const name = { fi: `Kategoria ${i}`, en: `Category ${i}` }
    const description = {
      fi: paragraph(),
      en: paragraph(),
    }
    const color = faker.internet.color()
    const {
      rows: [category],
    } = await client.query(
      `insert into app_public.event_categories(name, description, color, owner_organization_id)
        values ($1, $2, $3, $4)
        returning *
      `,
      [name, description, color, organizationId]
    )
    categories.push(category)
  }

  return categories
}

/******************************************************************************/
// Events

export const createEvents = async (
  client: PoolClient,
  count: number = 1,
  organizationId: string,
  categoryId: string,
  eventSignupUpcoming: boolean,
  eventSignupClosed: boolean,
  openQuotaSize: number = 0
) => {
  let events: SnakeCasedProperties<Event>[] = []
  for (let i = 0; i < count; i++) {
    const name = {
      fi: `Tapahtuma ${words()} ${i}`,
      en: `Event ${words()} ${i}`,
    }
    const description = {
      fi: [{ type: "paragraph", children: [{ text: paragraph() }] }],
      en: [{ type: "paragraph", children: [{ text: paragraph() }] }],
    }
    const location = faker.address.streetAddress()

    // By default create events that are open to registration (-1)
    const now = new Date()
    const dateAdjustment = eventSignupUpcoming ? 1 : eventSignupClosed ? -8 : -1
    const registrationStartTime = dayjs(now).add(dateAdjustment, "day").toDate()
    const registrationEndTime = dayjs(registrationStartTime)
      .add(7, "day")
      .toDate()

    const eventStartTime = dayjs(registrationEndTime).add(7, "day").toDate()
    const eventEndTime = dayjs(eventStartTime).add(1, "day").toDate()

    const eventCategoryId = categoryId
    const headerImageFile = faker.image.imageUrl(
      851,
      315,
      `nature?random=${Math.round(Math.random() * 1000)}`
    )

    const daySlug = dayjs(eventStartTime).format("YYYY-M-D")
    const slug = slugify(`${daySlug}-${name["fi"]}`, {
      lower: true,
    })
    const isDraft = false

    const {
      rows: [event],
    } = await client.query(
      `insert into app_public.events(
        name,
        slug,
        description,
        location,
        event_start_time,
        event_end_time,
        registration_start_time,
        registration_end_time,
        is_draft,
        header_image_file,
        open_quota_size,
        owner_organization_id,
        category_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      returning *
      `,
      [
        name,
        slug,
        description,
        location,
        eventStartTime,
        eventEndTime,
        registrationStartTime,
        registrationEndTime,
        isDraft,
        headerImageFile,
        openQuotaSize,
        organizationId,
        eventCategoryId,
      ]
    )
    events.push(event)
  }

  return events
}

/******************************************************************************/
// Quotas

export const createQuotas = async (
  client: PoolClient,
  count: number = 1,
  eventId: string,
  size?: number
) => {
  const quotas: SnakeCasedProperties<Quota>[] = []
  for (let i = 0; i < count; i++) {
    const title = { fi: `Kiintiö ${i}`, en: `Quota ${i}` }
    const s = size
      ? size
      : faker.datatype.number({
          min: 3,
          max: 20,
        })
    const {
      rows: [quota],
    } = await client.query(
      `insert into app_public.quotas(event_id, position, title, size)
        values ($1, $2, $3, $4)
        returning *
      `,
      [eventId, i, title, s]
    )
    quotas.push(quota)
  }

  return quotas
}

/******************************************************************************/
// Questions

const getRandomQuestionData = () => {
  const number = faker.datatype.number({ min: 1, max: 5 })
  return new Array(number).fill(null).map((_) => ({ fi: word(), en: word() }))
}

export const createQuestions = async (
  client: PoolClient,
  count: number = 1,
  eventId: string,
  isRequired?: boolean,
  type?: "CHECKBOX" | "RADIO" | "TEXT"
) => {
  const questionTypes = ["CHECKBOX", "RADIO", "TEXT"]
  let questions: SnakeCasedProperties<EventQuestion>[] = []
  for (let i = 0; i < count; i++) {
    const t = type ? type : questionTypes[i % 3]
    const label = { fi: words(), en: words() }
    let data
    if (t === "CHECKBOX") {
      data = getRandomQuestionData()
    } else if (t === "RADIO") {
      data = getRandomQuestionData()
    } else if (t === "TEXT") {
      data = null
    }
    const {
      rows: [question],
    } = await client.query(
      `with r1 as (
        insert into app_public.event_questions(event_id, position, type, label, is_required, data)
        values ($1, $2, $3, $4, $5, $6)
        returning *
      )
      select r1.id, r1.*, data::text[] as data from r1
      `,
      [eventId, i, t, label, isRequired, data]
    )
    questions.push(question)
  }

  questions = questions.map((q) => ({
    ...q,
    data: q?.data?.map((d: string) => JSON.parse(d)),
  })) as SnakeCasedProperties<EventQuestion>[]

  return questions
}

/******************************************************************************/
// Registration secrets

export const createRegistrationSecrets = async (
  client: PoolClient,
  registrations: SnakeCasedProperties<Registration>[],
  eventId: string,
  quotaId: string
) => {
  const registrationSecrets: RegistrationSecret[] = []
  for (const registration of registrations) {
    const {
      rows: [secret],
    } = await client.query(
      `insert into app_private.registration_secrets(event_id, quota_id, registration_id)
        values ($1, $2, $3)
        returning *
      `,
      [eventId, quotaId, registration.id]
    )
    registrationSecrets.push(secret)
  }

  return registrationSecrets
}

/******************************************************************************/
// Registrations

export const constructAnswersFromQuestions = (questions: any[]) => {
  let i = 0
  // Choose random language to simulate finnish and english registrations
  const chosenLanguage = faker.random.arrayElement(["fi", "en"])
  const answers = questions?.reduce((acc, cur) => {
    if (cur.type === "TEXT") {
      acc[cur.id] = chosenLanguage === "en" ? `Answer ${i}` : `Vastaus ${i}`
    } else if (cur.type === "CHECKBOX") {
      acc[cur.id] = cur?.data?.map((option: any) => option[chosenLanguage])
    } else if (cur.type === "RADIO") {
      acc[cur.id] = cur?.data?.[0][chosenLanguage]
    }
    i++

    return acc
  }, {})

  return answers
}

export const createRegistrations = async (
  client: PoolClient,
  count: number = 1,
  eventId: string,
  quotaId: string,
  questions: SnakeCasedProperties<EventQuestion>[]
) => {
  const registrations: SnakeCasedProperties<Registration>[] = []
  for (let i = 0; i < count; i++) {
    const firstName = faker.name.firstName()
    const lastName = faker.name.lastName()
    const email = faker.internet.email()
    const answers = constructAnswersFromQuestions(questions)
    const isFinished = true
    const {
      rows: [registration],
    } = await client.query(
      `insert into app_public.registrations(event_id, quota_id, first_name, last_name, email, answers, is_finished)
        values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [eventId, quotaId, firstName, lastName, email, answers, isFinished]
    )
    await client.query(
      `insert into app_private.registration_secrets(event_id, quota_id, registration_id)
        values ($1, $2, $3)`,
      [eventId, quotaId, registration.id]
    )
    registrations.push(registration)
  }

  return registrations
}

export const createSession = async (
  client: Pool,
  userId: string
): Promise<Session> => {
  const {
    rows: [session],
  } = await client.query(
    `insert into app_private.sessions (user_id)
      values ($1)
      returning *
    `,
    [userId]
  )
  return session
}

async function getUserEmailSecrets(rootPgPool: Pool, email: string) {
  const {
    rows: [userEmailSecrets],
  } = await rootPgPool.query(
    `select *
      from app_private.user_email_secrets
      where user_email_id = (
        select id
        from app_public.user_emails
        where email = $1
        order by id desc
        limit 1
      )
    `,
    [email]
  )
  return userEmailSecrets
}

export default fp(CypressServerCommands)
