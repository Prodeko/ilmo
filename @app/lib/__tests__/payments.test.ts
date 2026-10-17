import {
  formatEuro,
  guildReceivesCents,
  isValidTicketPriceCents,
  MIN_PAID_PRICE_CENTS,
  paymentsEnabled,
  SERVICE_FEE_CENTS,
  STRIPE_PERCENT_FEE,
  totalChargeCents,
} from "../src/payments"

describe("fee constants", () => {
  test("match the PRD", () => {
    expect(SERVICE_FEE_CENTS).toBe(25)
    expect(STRIPE_PERCENT_FEE).toBe(0.015)
    expect(MIN_PAID_PRICE_CENTS).toBe(25)
  })

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
    // PRD example: a 10,00 € ticket gives the guild ≈ 9,85 €
    [1000, 985],
    // 75 − 0,015 × 100 = 73,5 exactly: halves round up
    [75, 74],
    [275, 271],
  ])("%i cents → %i", (price, received) => {
    expect(guildReceivesCents(price)).toBe(received)
  })

  test("matches the PRD formula for every price up to 1000 €", () => {
    const mismatches: number[] = []
    for (let p = MIN_PAID_PRICE_CENTS; p <= 100000; p++) {
      // Exact rational arithmetic: (985p − 375) / 1000, halves up.
      const n = 985 * p - 375
      const expected = Math.floor(n / 1000) + (n % 1000 >= 500 ? 1 : 0)
      if (guildReceivesCents(p) !== expected) mismatches.push(p)
    }
    expect(mismatches).toEqual([])
  })

  test.each([-25, 18.5, NaN])("rejects %p", (price) => {
    expect(() => guildReceivesCents(price)).toThrow(RangeError)
  })
})

describe("isValidTicketPriceCents", () => {
  test.each([
    [0, true],
    [1, false],
    [24, false],
    [25, true],
    [1800, true],
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

  test("uses the decimal comma in every language", () => {
    for (const lang of ["fi", "en", "sv"]) {
      expect(formatEuro(1800, lang)).toBe("18,00 €")
    }
  })

  test("rejects fractional cents", () => {
    expect(() => formatEuro(18.5)).toThrow(RangeError)
  })
})

describe("paymentsEnabled", () => {
  const KEYS = [
    "PAYMENTS_ENABLED",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ] as const
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  function setAll() {
    process.env.PAYMENTS_ENABLED = "1"
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123"
  }

  test("is off with nothing configured", () => {
    expect(paymentsEnabled()).toBe(false)
  })

  test("is on when the flag and both secrets are set", () => {
    setAll()
    expect(paymentsEnabled()).toBe(true)
  })

  test.each(KEYS)("is off when %s is missing", (key) => {
    setAll()
    delete process.env[key]
    expect(paymentsEnabled()).toBe(false)
  })

  test.each(["0", "true", "yes", ""])(
    "is off when PAYMENTS_ENABLED=%p",
    (value) => {
      setAll()
      process.env.PAYMENTS_ENABLED = value
      expect(paymentsEnabled()).toBe(false)
    }
  )
})
