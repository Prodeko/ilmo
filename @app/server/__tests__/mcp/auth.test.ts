import { randomUUID } from "crypto"

import { McpAuthError, resolveMcpSession } from "../../src/mcp/auth"
import {
  deleteTestData,
  poolFromUrl,
  setup,
  teardown,
  TEST_DATABASE_URL,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

const logger = { debug: () => {}, warn: () => {}, error: () => {} }
const pool = poolFromUrl(TEST_DATABASE_URL!)

function claims(overrides: Record<string, unknown> = {}) {
  const sub = randomUUID()
  return {
    sub,
    sid: randomUUID(),
    email: `testuser_${sub.slice(0, 8)}@example.com`,
    email_verified: true,
    name: "Testi Käyttäjä",
    ...overrides,
  }
}

async function sessionRow(uuid: string) {
  const {
    rows: [row],
  } = await pool.query(
    `select s.kind, s.oauth_sid, s.user_id, ua.identifier
      from app_private.sessions s
      join app_public.user_authentications ua
        on ua.user_id = s.user_id and ua.service = 'keycloak'
      where s.uuid = $1`,
    [uuid]
  )
  return row
}

describe("resolveMcpSession", () => {
  it("registers a new identity and creates an mcp session for its sid", async () => {
    const c = claims()
    const sessionId = await resolveMcpSession(pool, c, logger)

    const row = await sessionRow(sessionId)
    expect(row).toMatchObject({
      kind: "mcp",
      oauth_sid: c.sid,
      identifier: c.sub,
    })
  })

  it("reuses the session for the same Keycloak session", async () => {
    const c = claims()
    const first = await resolveMcpSession(pool, c, logger)
    const second = await resolveMcpSession(pool, c, logger)
    expect(second).toEqual(first)

    const third = await resolveMcpSession(
      pool,
      { ...c, sid: randomUUID() },
      logger
    )
    expect(third).not.toEqual(first)
    expect((await sessionRow(third)).user_id).toEqual(
      (await sessionRow(first)).user_id
    )
  })

  it("leaves the web login's stored secrets alone for a linked identity", async () => {
    const c = claims()
    await resolveMcpSession(pool, c, logger)
    await pool.query(
      `update app_private.user_authentication_secrets uas
        set details = '{"id_token": "web-login-hint"}'
        from app_public.user_authentications ua
        where ua.id = uas.user_authentication_id and ua.identifier = $1`,
      [c.sub]
    )

    await resolveMcpSession(pool, { ...c, sid: randomUUID() }, logger)

    const {
      rows: [secret],
    } = await pool.query(
      `select uas.details from app_private.user_authentication_secrets uas
        join app_public.user_authentications ua on ua.id = uas.user_authentication_id
        where ua.identifier = $1`,
      [c.sub]
    )
    expect(secret.details).toEqual({ id_token: "web-login-hint" })
  })

  it("refuses to create a user from an unverified email", async () => {
    await expect(
      resolveMcpSession(pool, claims({ email_verified: false }), logger)
    ).rejects.toBeInstanceOf(McpAuthError)
  })

  it("refuses a token without a sid", async () => {
    await expect(
      resolveMcpSession(pool, claims({ sid: undefined }), logger)
    ).rejects.toBeInstanceOf(McpAuthError)
  })

  it("refuses a Keycloak session that already belongs to another user", async () => {
    const a = claims()
    await resolveMcpSession(pool, a, logger)
    await expect(
      resolveMcpSession(pool, claims({ sid: a.sid }), logger)
    ).rejects.toBeInstanceOf(McpAuthError)
  })

  it("refuses an identity that resolves to a break-glass account", async () => {
    const c = claims()
    await resolveMcpSession(pool, c, logger)
    const {
      rows: [{ user_id: userId }],
    } = await pool.query(
      `select user_id from app_public.user_authentications where identifier = $1`,
      [c.sub]
    )
    const {
      rows: [original],
    } = await pool.query(
      "select username from app_public.users where id = $1",
      [userId]
    )
    await pool.query(
      "update app_public.users set username = 'toimari' where id = $1",
      [userId]
    )
    try {
      await expect(
        resolveMcpSession(pool, { ...c, sid: randomUUID() }, logger)
      ).rejects.toBeInstanceOf(McpAuthError)
    } finally {
      await pool.query(
        "update app_public.users set username = $1 where id = $2",
        [original.username, userId]
      )
    }
  })
})
