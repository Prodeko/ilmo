import { PasswordStrengthDocument } from "@app/graphql"

import { runGraphQLQuery, setup, teardown } from "../helpers"

beforeAll(setup)
afterAll(teardown)

describe("calculatePasswordStrength", () => {
  it("returns feedback for weak password", async () => {
    await runGraphQLQuery(
      PasswordStrengthDocument,

      // GraphQL variables:
      {
        password: "weakweakweak",
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()
        const { score, feedback } = json.data.calculatePasswordStrength
        expect(score).toEqual(1)
        expect(feedback.suggestions).toEqual([
          "Add more words that are less common.",
          "Avoid repeated words and characters.",
        ])
      }
    )
  })

  it("returns no feedback for strong password", async () => {
    await runGraphQLQuery(
      PasswordStrengthDocument,

      // GraphQL variables:
      {
        password: "stronkPassword!1",
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()
        const { score, feedback } = json.data.calculatePasswordStrength
        expect(score).toEqual(4)
        expect(feedback.suggestions).toEqual([])
      }
    )
  })
})
