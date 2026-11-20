import { PoolClient } from "pg"

import {
  becomeRoot,
  becomeUser,
  createEventCategories,
  createEvents,
  createOrganizations,
  createQuestions,
  createQuotas,
  createUsers,
  withAnonymousDb,
  withRootDb,
  withUserDb,
} from "../../helpers"

async function setRegistrationProfile(
  client: PoolClient,
  telegram: string,
  dietaryRestrictions: string
) {
  const {
    rows: [profile],
  } = await client.query(
    `select * from app_public.set_registration_profile($1, $2)`,
    [telegram, dietaryRestrictions]
  )
  return profile
}

/**
 * Creates an open event whose two TEXT questions are marked to be prefilled
 * with the telegram handle and dietary restrictions, and an unfinished
 * registration to it, the way claim_registration_token leaves one.
 */
async function setupRegistration(client: PoolClient, email: string) {
  await becomeRoot(client)
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
    eventCategory.id
  )
  const [quota] = await createQuotas(client, 1, event.id)
  const [telegramQuestion, dietaryQuestion] = await createQuestions(
    client,
    2,
    event.id,
    false,
    "TEXT" as any
  )
  await client.query(
    `update app_public.event_questions set prefill = 'TELEGRAM' where id = $1`,
    [telegramQuestion.id]
  )
  await client.query(
    `update app_public.event_questions set prefill = 'DIETARY_RESTRICTIONS' where id = $1`,
    [dietaryQuestion.id]
  )
  const {
    rows: [registration],
  } = await client.query(
    `insert into app_public.registrations(event_id, quota_id, first_name, last_name, email)
      values ($1, $2, 'Testi', 'Testaaja', $3)
      returning *`,
    [event.id, quota.id, email]
  )
  return { registration, telegramQuestion, dietaryQuestion }
}

// The registration is finished by create_registration, a security definer
// function, so the update runs as root with the user's session still set.
async function finishRegistration(
  client: PoolClient,
  registrationId: string,
  answers: Record<string, string>
) {
  await becomeRoot(client)
  await client.query(
    `update app_public.registrations set answers = $2, is_finished = true where id = $1`,
    [registrationId, answers]
  )
}

async function getProfile(client: PoolClient, userId: string) {
  await becomeRoot(client)
  const {
    rows: [profile],
  } = await client.query(
    `select * from app_public.registration_profiles where user_id = $1`,
    [userId]
  )
  return profile
}

describe("app_public.registration_profiles", () => {
  it("can set and update own registration profile", () =>
    withUserDb(async (client, user) => {
      const created = await setRegistrationProfile(client, "@testi", "Vegaani")
      expect(created).toMatchObject({
        user_id: user.id,
        telegram: "@testi",
        dietary_restrictions: "Vegaani",
      })

      // Empty values are stored as null
      const updated = await setRegistrationProfile(client, "  @uusi ", "")
      expect(updated).toMatchObject({
        user_id: user.id,
        telegram: "@uusi",
        dietary_restrictions: null,
      })
    }))

  it("cannot see another user's registration profile", () =>
    withRootDb(async (client) => {
      const [user, otherUser] = await createUsers(client, 2)
      await becomeUser(client, user.id)
      await setRegistrationProfile(client, "@testi", "Gluteeniton")

      await becomeUser(client, otherUser.id)
      const { rows } = await client.query(
        `select * from app_public.registration_profiles`
      )
      expect(rows).toHaveLength(0)
    }))

  it("cannot set a registration profile when logged out", () =>
    withAnonymousDb(async (client) => {
      const promise = setRegistrationProfile(client, "@testi", "Vegaani")
      await expect(promise).rejects.toMatchObject({ code: "LOGIN" })
    }))

  it("saves prefill answers when the user finishes their registration", () =>
    withUserDb(async (client, user) => {
      const { registration, telegramQuestion, dietaryQuestion } =
        await setupRegistration(client, user._email)

      await becomeUser(client, user.id)
      await finishRegistration(client, registration.id, {
        [telegramQuestion.id]: "@testi",
        [dietaryQuestion.id]: "Laktoositon",
      })

      expect(await getProfile(client, user.id)).toMatchObject({
        telegram: "@testi",
        dietary_restrictions: "Laktoositon",
      })
    }))

  it("keeps saved values that a registration leaves unanswered", () =>
    withUserDb(async (client, user) => {
      await setRegistrationProfile(client, "@vanha", "Vegaani")
      const { registration, telegramQuestion } = await setupRegistration(
        client,
        user._email
      )

      await becomeUser(client, user.id)
      await finishRegistration(client, registration.id, {
        [telegramQuestion.id]: "@uusi",
      })

      expect(await getProfile(client, user.id)).toMatchObject({
        telegram: "@uusi",
        dietary_restrictions: "Vegaani",
      })
    }))

  it("does not save answers of a registration made for someone else", () =>
    withUserDb(async (client, user) => {
      const { registration, telegramQuestion, dietaryQuestion } =
        await setupRegistration(client, "kaveri@example.com")

      await becomeUser(client, user.id)
      await finishRegistration(client, registration.id, {
        [telegramQuestion.id]: "@kaveri",
        [dietaryQuestion.id]: "Pähkinäallergia",
      })

      expect(await getProfile(client, user.id)).toBeUndefined()
    }))
})
