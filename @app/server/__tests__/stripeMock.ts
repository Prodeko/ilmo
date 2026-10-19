/*
 * Kept free of imports: it runs inside jest.mock("stripe", ...) factories,
 * before the modules that use the Stripe client are loaded.
 */

/**
 * Factory for `jest.mock("stripe", ...)`: the Stripe constructor returns one
 * shared fake client whose Checkout methods are jest mocks, while
 * `webhooks` is the real implementation, so signatures are really checked
 * (it needs no network).
 */
export function mockStripeModule() {
  const ActualStripe = jest.requireActual("stripe")
  const real = new ActualStripe("sk_test_123")
  const client = {
    checkout: {
      sessions: {
        create: jest.fn(),
        expire: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    refunds: { create: jest.fn() },
    webhooks: real.webhooks,
  }
  return {
    __esModule: true,
    default: jest.fn(() => client),
  }
}
