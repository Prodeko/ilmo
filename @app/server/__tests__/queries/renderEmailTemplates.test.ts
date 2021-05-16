import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

test("render email templates query", async () => {
  await runGraphQLQuery(
    // GraphQL query goes here:
    `{
      renderEmailTemplates {
        templates {
          name
          html
          text
        }
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
      const templates = json.data!.renderEmailTemplates.templates
      templates.forEach((t) => {
        expect(t.html).toBeTruthy()
        expect(t.text).toBeTruthy()
      })
    }
  )
})
