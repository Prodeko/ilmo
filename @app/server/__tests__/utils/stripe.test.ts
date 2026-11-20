import Stripe from "stripe"

import { getStripe, resetStripeClient } from "../../src/utils/stripe"

jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((key: string) => ({ key })),
}))

const StripeMock = Stripe as unknown as jest.Mock

const KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const
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

describe("getStripe", () => {
  it("throws while Stripe is not configured, never building a client, and again once a secret is removed", () => {
    expect(() => getStripe()).toThrow(/not configured/)
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    expect(() => getStripe()).toThrow(/not configured/)
    expect(StripeMock).not.toHaveBeenCalled()

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123"
    getStripe()
    expect(StripeMock).toHaveBeenCalledTimes(1)
    delete process.env.STRIPE_WEBHOOK_SECRET
    expect(() => getStripe()).toThrow(/not configured/)
  })
})
