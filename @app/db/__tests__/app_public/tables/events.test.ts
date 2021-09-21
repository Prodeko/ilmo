import dayjs, { Dayjs } from "dayjs"

import {
  createEventCategories,
  createOrganizations,
  withUserDb,
} from "../../helpers"

function getEventValues(eventStartTime: Dayjs) {
  const name = {
    fi: "Tapahtuma",
    en: "Event",
  }
  const description = {
    fi: "Testi",
    en: "Test",
  }
  const location = "Testikatu 123"

  const daySlug = eventStartTime.format("YYYY-M-D")
  const slug = `${daySlug}-${name["fi"].toLowerCase()}`

  return [name, slug, description, location]
}

const today = dayjs()
const yesterday = today.subtract(1, "day")
const tomorrow = today.add(1, "day")

describe("Test app_public.events table", () => {
  const commonQuery = `
    insert into app_public.events(
      name,
      slug,
      description,
      location,
      event_start_time,
      event_end_time,
      registration_start_time,
      registration_end_time,
      owner_organization_id,
      category_id,
      open_quota_size
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    returning *
  `

  it("cannot create an event with event_start_time > event_end_time", () =>
    withUserDb(async (client) => {
      const [organization] = await createOrganizations(client, 1)
      const [eventCategory] = await createEventCategories(
        client,
        1,
        organization.id
      )

      // Should not be able to create a new event where
      // event_start_time > event_end_time
      const eventStartTime = today
      const eventEndTime = yesterday

      const registrationStartTime = today
      const registrationEndTime = tomorrow

      const promise = client.query(commonQuery, [
        ...getEventValues(eventStartTime),
        eventStartTime,
        eventEndTime,
        registrationStartTime,
        registrationEndTime,
        organization.id,
        eventCategory.id,
        0,
      ])
      await expect(promise).rejects.toThrow(
        'new row for relation "events" violates check constraint "_cnstr_check_event_time"'
      )
    }))

  it("cannot create an event with registration_start_time > registration_end_time", () =>
    withUserDb(async (client) => {
      const [organization] = await createOrganizations(client, 1)
      const [eventCategory] = await createEventCategories(
        client,
        1,
        organization.id
      )

      const eventStartTime = today
      const eventEndTime = tomorrow

      // Should not be able to create a new event where
      // registration_start_time > registration_end_time
      const registrationStartTime = today
      const registrationEndTime = yesterday

      const promise = client.query(commonQuery, [
        ...getEventValues(eventStartTime),
        eventStartTime,
        eventEndTime,
        registrationStartTime,
        registrationEndTime,
        organization.id,
        eventCategory.id,
        0,
      ])
      await expect(promise).rejects.toThrow(
        'new row for relation "events" violates check constraint "_cnstr_check_event_registration_time"'
      )
    }))

  it("cannot create an event with registration_end_time >= event_start_time", () =>
    withUserDb(async (client) => {
      const [organization] = await createOrganizations(client, 1)
      const [eventCategory] = await createEventCategories(
        client,
        1,
        organization.id
      )

      const eventStartTime = today
      const eventEndTime = today.add(1, "hour")

      const registrationStartTime = today
      // Should not be able to create a new event where
      // registration_end_time >= event_start_time
      const registrationEndTime = today.add(1, "hour")

      const promise = client.query(commonQuery, [
        ...getEventValues(eventStartTime),
        eventStartTime,
        eventEndTime,
        registrationStartTime,
        registrationEndTime,
        organization.id,
        eventCategory.id,
        0,
      ])
      await expect(promise).rejects.toThrow(
        'new row for relation "events" violates check constraint "_cnstr_check_registration_end_before_event_start"'
      )
    }))

  it("cannot create an event with openQuotaSize < 0", () =>
    withUserDb(async (client) => {
      const [organization] = await createOrganizations(client, 1)
      const [eventCategory] = await createEventCategories(
        client,
        1,
        organization.id
      )

      const eventStartTime = today
      const eventEndTime = today.add(1, "hour")

      const registrationStartTime = yesterday
      const registrationEndTime = yesterday.add(1, "hour")

      const promise = client.query(commonQuery, [
        ...getEventValues(eventStartTime),
        eventStartTime,
        eventEndTime,
        registrationStartTime,
        registrationEndTime,
        organization.id,
        eventCategory.id,
        // Invalid open quota size
        -1,
      ])
      await expect(promise).rejects.toThrow(
        'new row for relation "events" violates check constraint "_cnstr_check_events_open_quota_size"'
      )
    }))
})
