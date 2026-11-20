import {
  formatEuro,
  guildReceivesCents,
  isValidTicketPriceCents,
  MIN_PAID_PRICE_CENTS,
  paymentsConfigured,
  totalChargeCents,
} from "../src/payments"

describe("fee constants", () => {
  test("the minimum paid price meets Stripe's 0,50 € minimum charge", () => {
    expect(totalChargeCents(MIN_PAID_PRICE_CENTS)).toBeGreaterThanOrEqual(50)
  })
})

describe("totalChargeCents", () => {
  test.each([
    [0, 0],
    [25, 50],
    [1800, 1825],
    [2200, 2225],
  ])("%i cents → %i", (price, total) => {
    expect(totalChargeCents(price)).toBe(total)
  })

  test.each([-1, 1.5, NaN, Infinity])("rejects %p", (price) => {
    expect(() => totalChargeCents(price)).toThrow(RangeError)
  })
})

describe("guildReceivesCents", () => {
  test.each([
    // free: nothing charged, nothing received
    [0, 0],
    // 25 − 0,015 × 50 = 24,25
    [25, 24],
    // 1800 − 0,015 × 1825 = 1772,625
    [1800, 1773],
    // 2200 − 0,015 × 2225 = 2166,625
    [2200, 2167],
    // A 10,00 € ticket gives the guild ≈ 9,85 €
    [1000, 985],
    // 75 − 0,015 × 100 = 73,5 exactly: halves round up
    [75, 74],
    [275, 271],
  ])("%i cents → %i", (price, received) => {
    expect(guildReceivesCents(price)).toBe(received)
  })
})

describe("isValidTicketPriceCents", () => {
  test.each([
    [0, true],
    [1, false],
    [24, false],
    [25, true],
    [1800, true],
    [1000000, true],
    [1000001, false],
    [-25, false],
    [25.5, false],
  ])("%p → %p", (price, valid) => {
    expect(isValidTicketPriceCents(price)).toBe(valid)
  })
})

describe("formatEuro", () => {
  test.each([
    [0, "0,00 €"],
    [5, "0,05 €"],
    [25, "0,25 €"],
    [1800, "18,00 €"],
    [1825, "18,25 €"],
    [2200, "22,00 €"],
    [75912, "759,12 €"],
    [123450, "1 234,50 €"],
    [-1800, "-18,00 €"],
  ])("%i cents → %p", (cents, text) => {
    expect(formatEuro(cents)).toBe(text)
  })

  test("rejects fractional cents", () => {
    expect(() => formatEuro(18.5)).toThrow(RangeError)
  })
})

describe("paymentsConfigured", () => {
  const ALL_SET = {
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WEBHOOK_SECRET: "whsec_123",
  }

  test("is true when both secrets are set", () => {
    expect(paymentsConfigured(ALL_SET)).toBe(true)
  })

  test.each([
    ["nothing is configured", {}],
    ["STRIPE_SECRET_KEY is missing", { STRIPE_WEBHOOK_SECRET: "whsec_123" }],
    ["STRIPE_WEBHOOK_SECRET is missing", { STRIPE_SECRET_KEY: "sk_test_123" }],
    ["a secret is empty", { ...ALL_SET, STRIPE_SECRET_KEY: "" }],
  ])("is false when %s", (_name, env) => {
    expect(paymentsConfigured(env)).toBe(false)
  })

  test("ignores PAYMENTS_ENABLED", () => {
    expect(paymentsConfigured({ ...ALL_SET, PAYMENTS_ENABLED: "0" })).toBe(true)
  })
})
