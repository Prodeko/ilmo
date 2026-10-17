import Stripe from "stripe"

import { getStripe, resetStripeClient } from "../../src/utils/stripe"

jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((key: string) => ({ key })),
}))

const StripeMock = Stripe as unknown as jest.Mock

const KEYS = [
  "PAYMENTS_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  StripeMock.mockClear()
  resetStripeClient()
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
  resetStripeClient()
})

function enable() {
  process.env.PAYMENTS_ENABLED = "1"
  process.env.STRIPE_SECRET_KEY = "sk_test_123"
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123"
}

describe("getStripe", () => {
  it("throws while payments are disabled and never builds a client", () => {
    expect(() => getStripe()).toThrow(/payments are disabled/)
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123"
    expect(() => getStripe()).toThrow(/payments are disabled/)
    expect(StripeMock).not.toHaveBeenCalled()
  })

  it("lazily builds one client from STRIPE_SECRET_KEY", () => {
    enable()
    expect(StripeMock).not.toHaveBeenCalled()
    const first = getStripe()
    const second = getStripe()
    expect(first).toBe(second)
    expect(StripeMock).toHaveBeenCalledTimes(1)
    expect(StripeMock.mock.calls[0][0]).toBe("sk_test_123")
  })

  it("throws again once payments are switched off", () => {
    enable()
    getStripe()
    delete process.env.PAYMENTS_ENABLED
    expect(() => getStripe()).toThrow(/payments are disabled/)
  })
})
