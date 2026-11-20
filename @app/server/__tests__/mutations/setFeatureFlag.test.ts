import { FeatureKey } from "@app/lib"

import { isFeatureEnabled } from "../../src/utils/featureFlags"
import {
  createUserAndLogIn,
  deleteTestData,
  poolFromUrl,
  runGraphQLQuery,
  setup,
  teardown,
  TEST_DATABASE_URL,
} from "../helpers"

// The registry has no keys yet; this test uses its own row.
const KEY = "server_mutation_test" as FeatureKey

const SET_FEATURE_FLAG = `
  mutation SetFeatureFlag($key: String!, $state: FeatureState!) {
    setFeatureFlag(input: { key: $key, state: $state }) {
      featureFlag {
        key
        state
      }
    }
  }
`

const pool = () => poolFromUrl(TEST_DATABASE_URL)

beforeAll(setup)
afterAll(teardown)

beforeEach(async () => {
  await deleteTestData()
  await pool().query(
    `insert into app_public.feature_flags (key, state, description)
     values ($1, 'off', 'Test flag')`,
    [KEY]
  )
})

afterEach(async () => {
  await pool().query("delete from app_public.feature_flags where key = $1", [
    KEY,
  ])
  await pool().query(
    "delete from app_private.feature_flag_events where key = $1",
    [KEY]
  )
})

describe("SetFeatureFlag", () => {
  it("is visible to server-side gates as soon as the switch commits", async () => {
    const { session } = await createUserAndLogIn({
      isAdmin: true,
      isDeveloper: true,
    })
    // Fill the cache with the old state.
    expect(await isFeatureEnabled(KEY)).toBe(false)

    await runGraphQLQuery(
      SET_FEATURE_FLAG,
      { key: KEY, state: "ON" },
      { user: { sessionId: session.uuid } },
      (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data!.setFeatureFlag.featureFlag).toEqual({
          key: KEY,
          state: "ON",
        })
      },
      false, // commit
      false
    )

    expect(await isFeatureEnabled(KEY)).toBe(true)
  })

  it("keeps serving the cached state for a change made outside the server", async () => {
    // The counterpart of the test above: without the mutation passing through
    // the server, the cache holds the old state until its TTL runs out.
    expect(await isFeatureEnabled(KEY)).toBe(false)
    await pool().query(
      "update app_public.feature_flags set state = 'on' where key = $1",
      [KEY]
    )
    expect(await isFeatureEnabled(KEY)).toBe(false)
  })

  it("is refused for an admin without the developer role", async () => {
    const { session } = await createUserAndLogIn({ isAdmin: true })

    await runGraphQLQuery(
      SET_FEATURE_FLAG,
      { key: KEY, state: "ON" },
      { user: { sessionId: session.uuid } },
      (json) => {
        expect(json.errors).toBeTruthy()
        expect(json.errors![0].extensions.exception.code).toBe("DNIED")
      },
      true,
      false
    )
    expect(await isFeatureEnabled(KEY)).toBe(false)
  })
})
