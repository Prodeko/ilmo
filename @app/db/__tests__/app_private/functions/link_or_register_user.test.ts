import { PoolClient } from "pg"

import { deleteTestData, snapshotSafe, withRootDb } from "../../helpers"

async function linkOrRegisterUser(
  client: PoolClient,
  userId: string | null,
  service: string | null,
  identifier: string | null,
  profile: { [key: string]: any } | null,
  authDetails: { [key: string]: any } | null
) {
  const {
    rows: [row],
  } = await client.query(
    `select * from app_private.link_or_register_user($1, $2, $3, $4, $5)`,
    [
      userId,
      service,
      identifier,
      profile ? JSON.stringify(profile) : null,
      authDetails ? JSON.stringify(authDetails) : null,
    ]
  )
  return row
}

beforeEach(deleteTestData)

describe("when account doesn't already exist", () => {
  it("can login with full oauth details", () =>
    withRootDb(async (client) => {
      const user = await linkOrRegisterUser(
        client,
        null,
        "oauth2",
        "123456",
        {
          email: "webbitiimi@prodeko.org",
          name: "Webbitiimi",
          avatar_url: "http://example.com/avatar.jpg",
          username: "webbitiimi",
        },
        {}
      )
      expect(user).toBeTruthy()
      expect(user.username).toEqual("webbitiimi")
      expect(user.name).toEqual("Webbitiimi")
      expect(user.avatar_url).toEqual("http://example.com/avatar.jpg")
      expect(user.is_admin).toEqual(false)
      expect(user.is_verified).toEqual(true)
      expect(snapshotSafe(user)).toMatchInlineSnapshot(`
{
  "avatar_url": "http://example.com/avatar.jpg",
  "created_at": "[DATE]",
  "id": "[ID]",
  "is_admin": false,
  "is_verified": true,
  "name": "Webbitiimi",
  "updated_at": "[DATE]",
  "username": "webbitiimi",
}
`)
    }))

  it("can login with minimal oauth details", () =>
    withRootDb(async (client) => {
      const user = await linkOrRegisterUser(
        client,
        null,
        "oauth2",
        "123456",
        {
          email: "webbitiimi@prodeko.org",
        },
        {}
      )
      expect(user).toBeTruthy()
      expect(user.username).toMatch(/^user(?:[1-9][0-9]+)?$/)
      expect(user.name).toEqual(null)
      expect(user.avatar_url).toEqual(null)
      expect(user.is_admin).toEqual(false)
      expect(user.is_verified).toEqual(true)
    }))

  test("cannot register without email", () =>
    withRootDb(async (client) => {
      const promise = client.query(
        "SELECT * FROM app_private.link_or_register_user($1, $2, $3, $4, $5)",
        [
          null,
          "oauth2",
          "123456",
          JSON.stringify({ email: null, firstName: "A", lastName: "B" }),
          JSON.stringify({}),
        ]
      )
      await expect(promise).rejects.toMatchInlineSnapshot(
        `[error: Email is required]`
      )
      await expect(promise).rejects.toMatchObject({
        code: "MODAT",
      })
    }))

  it("cannot register with invalid email", () =>
    withRootDb(async (client) => {
      const promise = linkOrRegisterUser(
        client,
        null,
        "oauth2",
        "123456",
        { email: "flibble" },
        {}
      )
      await expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
        `"value for domain app_public.email violates check constraint "email_check""`
      )
      await expect(promise).rejects.toMatchObject({
        code: "23514",
      })
    }))
})

it("login with new oauth sharing email of existing account links accounts", () =>
  withRootDb(async (client) => {
    const sharedEmail = "existing@example.com"
    const existingUser = await linkOrRegisterUser(
      client,
      null,
      "oauth2",
      "123456",
      {
        email: sharedEmail,
      },
      {}
    )
    expect(existingUser).toBeTruthy()
    const linkedUser = await linkOrRegisterUser(
      client,
      null,
      "twitter",
      "654321",
      {
        email: sharedEmail,
      },
      {}
    )
    expect(linkedUser).toBeTruthy()
    expect(existingUser.id).toEqual(linkedUser.id)
  }))

it("login with new oauth when logged in links accounts", () =>
  withRootDb(async (client) => {
    const oauth2User = await linkOrRegisterUser(
      client,
      null,
      "oauth2",
      "123456",
      {
        email: "webbitiimi@prodeko.org",
      },
      {}
    )
    expect(oauth2User).toBeTruthy()
    const twitterUser = await linkOrRegisterUser(
      client,
      oauth2User.id,
      "twitter",
      "654321",
      {
        email: "twitter@example.com",
      },
      {}
    )
    expect(twitterUser).toBeTruthy()
    expect(twitterUser.id).toEqual(oauth2User.id)
  }))
