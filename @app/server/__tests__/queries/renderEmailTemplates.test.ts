import { RenderEmailTemplatesDocument } from "@app/graphql"

import { deleteTestData, runGraphQLQuery, setup, teardown } from "../helpers"
import { enablePaymentsForEachTest } from "../payments"

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
      templates.forEach((t) => {
        expect(t.html).toBeTruthy()
        expect(t.text).toBeTruthy()
      })
    }
  )
})

describe("with payments enabled", () => {
  enablePaymentsForEachTest()

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
            "payment refund",
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
        expect(textOf("payment refund")).toContain("18,00 €")
      },
      true,
      false
    )
  })
})
