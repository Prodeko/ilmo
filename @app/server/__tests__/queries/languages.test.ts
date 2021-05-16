import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

test("languages query", async () => {
  await runGraphQLQuery(
    // GraphQL query goes here:
    `{
      languages {
        defaultLanguage
        supportedLanguages
      }
    }`,

    // GraphQL variables:
    {},

    // Additional props to add to `req` (e.g. `user: {session_id: '...'}`)
    {},

    // This function runs all your test assertions:
    async (json) => {
      expect(json.errors).toBeFalsy()
      expect(json.data).toBeTruthy()
      expect(json.data!.languages.defaultLanguage).toBe("fi")
      expect(json.data!.languages.supportedLanguages).toEqual(["fi", "en"])
    }
  )
})
