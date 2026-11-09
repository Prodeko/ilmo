import { RenderEmailTemplatesDocument } from "@app/graphql"

import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

test("render email templates query", async () => {
  await runGraphQLQuery(
    // GraphQL query goes here:
    RenderEmailTemplatesDocument,

    // GraphQL variables:
    {},

    // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
    {},

    // This function runs all your test assertions:
    async (json) => {
      expect(json.errors).toBeFalsy()
      expect(json.data).toBeTruthy()
      const templates = json.data!.renderEmailTemplates.templates
      const reminder = templates.find((t) => t.name === "registration reminder")
      expect(reminder?.text).toContain("Registration opens soon: Test event")
      expect(reminder?.text).toContain("1 January 2021 at 12:00")
      expect(reminder?.text).not.toContain("[object Object]")
      templates.forEach((t) => {
        expect(t.html).toBeTruthy()
        expect(t.text).toBeTruthy()
      })
    }
  )
})
