import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

test("languages query", async () => {
  await runGraphQLQuery(
    // GraphQL query goes here:
    `{
      defaultLanguage
      supportedLanguages
     }
    `,

    // GraphQL variables:
    {},

    // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
    {},

    // This function runs all your test assertions:
    async (json) => {
      expect(json.errors).toBeFalsy()
      expect(json.data).toBeTruthy()
      expect(json.data!.defaultLanguage).toEqual(["FI"])
      expect(json.data!.supportedLanguages).toEqual(["FI", "EN", "SV"])
    }
  )
})
