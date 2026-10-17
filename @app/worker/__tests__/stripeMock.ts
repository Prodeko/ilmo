/*
 * Kept free of imports: it runs inside jest.mock("stripe", ...) factories,
 * before the modules that use the Stripe client are loaded.
 */

/**
 * Factory for `jest.mock("stripe", ...)`: the Stripe constructor returns one
 * shared fake client whose methods are jest mocks. Nothing talks to Stripe.
 */
export function mockStripeModule() {
  const client = {
    checkout: {
      sessions: {
        retrieve: jest.fn(),
      },
    },
    refunds: { create: jest.fn() },
  }
  return {
    __esModule: true,
    default: jest.fn(() => client),
  }
}
