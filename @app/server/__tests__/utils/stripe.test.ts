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
  it("throws while payments are disabled, never building a client, and again once they are switched off", () => {
    expect(() => getStripe()).toThrow(/payments are disabled/)
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123"
    expect(() => getStripe()).toThrow(/payments are disabled/)
    expect(StripeMock).not.toHaveBeenCalled()

    enable()
    getStripe()
    delete process.env.PAYMENTS_ENABLED
    expect(() => getStripe()).toThrow(/payments are disabled/)
  })
})
