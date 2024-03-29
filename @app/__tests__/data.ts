import {
  Event,
  EventCategory,
  EventQuestion,
  Organization,
  QuestionType,
  Quota,
  Registration,
} from "@app/graphql"
import { Session } from "@app/lib"
import dayjs from "dayjs"
import faker from "faker"
import { PoolClient } from "pg"
import slugify from "slugify"

import type { SnakeCasedProperties } from "type-fest"

export type User = {
  id: string
  username: string
  _email: string
  _password: string
}

let userCreationCounter = 0
if (process.env.IN_TESTS) {
  // Enables multiple calls to `createUsers` within the same test to still have
  // deterministic results without conflicts.
  beforeEach(() => {
    userCreationCounter = 0
  })
}

/**
 * The utility functions below are used to prepopulate the database with objects
 * that might be needed by other tests or scripts.
 */

export const createUsers = async (
  client: PoolClient,
  count: number = 1,
  verified: boolean = true,
  isAdmin: boolean = false
): Promise<SnakeCasedProperties<User>[]> => {
  const users = []
  if (userCreationCounter > 25) {
    throw new Error("Too many users created!")
  }
  for (let i = 0; i < count; i++) {
    const userLetter = "abcdefghijklmnopqrstuvwxyz"[userCreationCounter]
    userCreationCounter++
    const password = userLetter.repeat(12)
    const email = `${userLetter}${i || ""}@b.c`
    const user = (
      await client.query(
        `select * from app_private.really_create_user(
        username := $1,
        email := $2,
        name := $3,
        avatar_url := $4,
        password := $5,
        email_is_verified := $6,
        is_admin := $7
      )`,
        [
          `testuser_${userLetter}`,
          email,
          `User ${userLetter}`,
          null,
          password,
          verified,
          isAdmin,
        ]
      )
    ).rows[0]
    user._email = email
    user._password = password
    users.push(user)
  }
  return users
}

const paragraph = () => faker.lorem.paragraph()
const word = () => faker.lorem.word()
const words = () => faker.lorem.words()

/******************************************************************************/
// Sessions

export const createSession = async (
  client: PoolClient,
  userId: string
): Promise<Session> => {
  const {
    rows: [session],
  } = await client.query(
    `insert into app_private.sessions(user_id)
      values ($1::uuid)
      returning *
    `,
    [userId]
  )
  return session
}

/******************************************************************************/
// Organizations

export const createOrganizations = async (
  client: PoolClient,
  count: number = 1
): Promise<SnakeCasedProperties<Organization>[]> => {
  const organizations = []
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
): Promise<SnakeCasedProperties<EventCategory>[]> => {
  const categories = []
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
  signupOpen: boolean = true,
  isDraft: boolean = false,
  openQuotaSize: number = 0,
  times: Date[] = undefined
): Promise<SnakeCasedProperties<Event>[]> => {
  const events = []
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

    let [
      registrationStartTime,
      registrationEndTime,
      eventStartTime,
      eventEndTime,
    ] = times || []
    if (!times) {
      const now = dayjs()
      const dayAdjustment = signupOpen ? -1 : 1
      registrationStartTime = dayjs(now).add(dayAdjustment, "day").toDate()
      registrationEndTime = faker.date.between(
        dayjs(registrationStartTime).add(1, "day").toDate(),
        dayjs(registrationStartTime).add(7, "day").toDate()
      )

      eventStartTime = faker.date.between(
        registrationEndTime,
        dayjs(registrationEndTime).add(7, "day").toDate()
      )
      eventEndTime = faker.date.between(
        eventStartTime,
        dayjs(eventStartTime).add(1, "day").toDate()
      )
    }

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
): Promise<SnakeCasedProperties<Quota>[]> => {
  const quotas = []
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
  type?: QuestionType
): Promise<SnakeCasedProperties<EventQuestion>[]> => {
  const questionTypes = Object.values(QuestionType)
  let questions = []
  for (let i = 0; i < count; i++) {
    const t = type ? type : questionTypes[i % 3]
    const label = { fi: words(), en: words() }
    let data
    if ([QuestionType.Radio, QuestionType.Checkbox].includes(t)) {
      data = getRandomQuestionData()
    } else if (t === QuestionType.Text) {
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
    data: q?.data?.map((d) => JSON.parse(d)),
  }))

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
  const registrationSecrets = []
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

export const constructAnswersFromQuestions = (
  questions: SnakeCasedProperties<EventQuestion>[]
) => {
  let i = 0
  // Choose random language to simulate finnish and english registrations
  const chosenLanguage = faker.random.arrayElement(["fi", "en"])
  const answers = questions?.reduce((acc, cur) => {
    if (cur.type === QuestionType.Text) {
      acc[cur.id] = chosenLanguage === "en" ? `Answer ${i}` : `Vastaus ${i}`
    } else if (cur.type === QuestionType.Checkbox) {
      acc[cur.id] = cur.data.map((option) => option[chosenLanguage])
    } else if (cur.type === QuestionType.Radio) {
      acc[cur.id] = cur.data[0][chosenLanguage]
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
): Promise<SnakeCasedProperties<Registration>[]> => {
  const registrations = []
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
    registrations.push(registration)
  }

  return registrations
}
