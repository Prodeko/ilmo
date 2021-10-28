import {
  asRoot,
  claimRegistrationToken,
  createEventData,
  withUserDb,
} from "../../helpers"

it("can claim registration token and token expires", () =>
  withUserDb(async (client) => {
    const { event, quota } = await createEventData(client)

    // Action
    const { registrationToken, updateToken } = await claimRegistrationToken(
      event.id,
      quota.id
    )

    // Assertions
    const {
      rows: [registrationSecret],
    } = await asRoot(client, () =>
      client.query(
        "select * from app_private.registration_secrets where event_id = $1",
        [event.id]
      )
    )
    expect(registrationSecret.event_id).toEqual(event.id)
    expect(registrationSecret.quota_id).toEqual(quota.id)
    expect(registrationSecret.registration_token).toEqual(registrationToken)
    expect(registrationSecret.update_token).toEqual(updateToken)
  }))
