import { downloadRegistrations } from "../src/tableUtils"

import type {
  EventPage_QuestionFragment,
  ListEventRegistrations_RegistrationFragment,
} from "@app/graphql"

const questions = [
  { id: "q1", label: { fi: "Ruokavalio", en: "Diet" } },
] as unknown as EventPage_QuestionFragment[]

function registration(
  overrides: Partial<ListEventRegistrations_RegistrationFragment> = {}
) {
  return {
    id: "r1",
    fullName: "Aino Virtanen",
    email: "aino@example.com",
    answers: { q1: "Vegan" },
    isFinished: true,
    status: "IN_QUOTA",
    position: 1,
    priceCents: 1800,
    paymentStatus: "PAID",
    createdAt: "2026-10-17T12:00:00Z",
    updatedAt: "2026-10-17T12:00:00Z",
    quota: { id: "quota1", position: 0, title: { fi: "Jäsenet" }, size: 10 },
    ...overrides,
  } as unknown as ListEventRegistrations_RegistrationFragment
}

describe("downloadRegistrations", () => {
  test("leaves out payment columns by default", () => {
    const [row] = downloadRegistrations(questions)([registration()])
    expect(Object.keys(row)).toEqual([
      "fullName",
      "email",
      "status",
      "position",
      "quota",
      "Ruokavalio",
    ])
  })

  test("adds payment status and price after the quota when asked to", () => {
    const [row] = downloadRegistrations(questions, { includePayments: true })([
      registration(),
    ])
    expect(Object.keys(row)).toEqual([
      "fullName",
      "email",
      "status",
      "position",
      "quota",
      "paymentStatus",
      "price",
      "Ruokavalio",
    ])
    expect(row).toMatchObject({
      quota: "Jäsenet",
      paymentStatus: "PAID",
      price: "18,00 €",
      Ruokavalio: "Vegan",
    })

    const [labelled] = downloadRegistrations(questions, {
      includePayments: true,
      paymentStatusLabel: (status) => `label:${status}`,
    })([registration()])
    expect(labelled).toMatchObject({ paymentStatus: "label:PAID" })
  })

  test("writes empty payment cells when there is no price or status", () => {
    const [row] = downloadRegistrations(questions, { includePayments: true })([
      registration({ priceCents: null, paymentStatus: null }),
    ])
    expect(row).toMatchObject({ paymentStatus: "", price: "" })
  })

  test("keeps a question labelled like a payment column", () => {
    const [row] = downloadRegistrations(
      [{ ...questions[0], label: { fi: "price", en: "price" } }],
      { includePayments: true }
    )([registration()])
    expect(row).toMatchObject({
      price: "Vegan",
      "price (Ilmo)": "18,00 €",
      paymentStatus: "PAID",
    })
  })
})
