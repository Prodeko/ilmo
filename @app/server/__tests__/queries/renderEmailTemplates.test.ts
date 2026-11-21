import { RenderEmailTemplatesDocument } from "@app/graphql"

import {
  deleteTestData,
  poolFromUrl,
  runGraphQLQuery,
  setFeatureFlag,
  setup,
  teardown,
  TEST_DATABASE_URL,
} from "../helpers"

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
      // The payments flag is off: no payment emails, no payment blocks
      const names = templates.map((t) => t.name)
      expect(names.some((name) => name.startsWith("payment"))).toBe(false)
      templates.forEach((t) => {
        expect(t.text).not.toContain("palvelumaksu")
      })
    }
  )
})

describe("with the payments flag on", () => {
  beforeEach(() =>
    setFeatureFlag(poolFromUrl(TEST_DATABASE_URL), "payments", "on")
  )

  test("lists the payment emails, rendered with example payments", async () => {
    await runGraphQLQuery(
      RenderEmailTemplatesDocument,
      {},
      {},
      async (json) => {
        expect(json.errors).toBeFalsy()
        const templates = json.data!.renderEmailTemplates.templates
        const names = templates.map((t) => t.name)
        // Partials such as payment_macros.njk are not emails
        expect(names).toEqual(
          expect.arrayContaining([
            "event registration",
            "spot from queue",
            "payment received",
            "payment reminder",
          ])
        )
        expect(names.some((name) => name.includes("macros"))).toBe(false)

        const textOf = (name: string) =>
          templates.find((t) => t.name === name)!.text
        expect(textOf("event registration")).toContain(
          "Lippu 18,00 € + palvelumaksu 0,25 € = 18,25 €"
        )
        expect(textOf("spot from queue")).toContain("Maksa 18,25 €")
        expect(textOf("payment reminder")).toContain(
          "Lippu 18,00 € + palvelumaksu 0,25 € = 18,25 €"
        )
        expect(textOf("payment received")).toContain("18,25 €")
        expect(names).not.toContain("payment refund")
      },
      true,
      false
    )
  })
})
