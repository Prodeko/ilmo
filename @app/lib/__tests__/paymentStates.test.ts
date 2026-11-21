import {
  isStripeCheckoutUrl,
  payPageState,
  quotaRequiresPayment,
} from "../src/paymentStates"

describe("quotaRequiresPayment", () => {
  test.each([
    [true, 1800, true],
    [true, 25, true],
    [true, 0, false],
    [false, 1800, false],
    [null, 1800, false],
    [true, null, false],
  ] as const)("enabled=%p price=%p → %p", (on, price, out) => {
    expect(quotaRequiresPayment(on, price)).toBe(out)
  })
})

describe("payPageState", () => {
  const unpaid = { status: "UNPAID" as const, paidManually: false }
  const paid = { status: "PAID" as const, paidManually: false }

  test.each([
    // Payments disabled wins over everything
    ["disabled, unpaid", false, unpaid, undefined, "disabled"],
    ["disabled, no payment", false, null, undefined, "disabled"],
    // Payments switched off: a settled payment still shows, Pay does not
    [
      "switched off, unpaid",
      true,
      { ...unpaid, blockedReason: "PAYMENTS_DISABLED" },
      undefined,
      "disabled",
    ],
    [
      "switched off, paid",
      true,
      { ...paid, blockedReason: "PAYMENTS_DISABLED" },
      undefined,
      "paid",
    ],
    ["no payment", true, null, undefined, "notFound"],
    ["undefined payment", true, undefined, undefined, "notFound"],
    // Settled states
    ["paid by card", true, paid, undefined, "paid"],
    [
      "PAID, paid manually",
      true,
      { status: "PAID", paidManually: true },
      undefined,
      "paidManually",
    ],
    [
      "PAID_MANUALLY",
      true,
      { status: "PAID_MANUALLY", paidManually: true },
      undefined,
      "paidManually",
    ],
    [
      "not required",
      true,
      { status: "NOT_REQUIRED", paidManually: false },
      undefined,
      "free",
    ],
    // Settled states ignore the return status
    [
      "paid, returned with success",
      true,
      paid,
      { returnStatus: "success" },
      "paid",
    ],
    // Blocked unpaid states
    [
      "unpaid, in queue",
      true,
      { ...unpaid, blockedReason: "IN_QUEUE" },
      undefined,
      "queued",
    ],
    [
      "unpaid, payment not open",
      true,
      { ...unpaid, blockedReason: "PAYMENT_NOT_OPEN" },
      undefined,
      "opensLater",
    ],
    // Unpaid, cancelled and confirming
    ["unpaid", true, unpaid, undefined, "unpaid"],
    [
      "unpaid, returned cancelled",
      true,
      unpaid,
      { returnStatus: "cancelled" },
      "unpaid",
    ],
    [
      "unpaid, returned with success",
      true,
      unpaid,
      { returnStatus: "success" },
      "confirming",
    ],
    [
      "unpaid, confirming timed out",
      true,
      unpaid,
      { returnStatus: "success", confirmTimedOut: true },
      "unpaid",
    ],
  ] as const)("%s → %p", (_name, enabled, payment, options, expected) => {
    expect(payPageState(enabled, payment, options)).toBe(expected)
  })
})

describe("isStripeCheckoutUrl", () => {
  test.each([
    ["https://checkout.stripe.com/c/pay/cs_test_123", true],
    ["https://checkout.stripe.com", true],
    ["http://checkout.stripe.com/c/pay/cs_test_123", false],
    ["https://checkout.stripe.com.evil.example/c/pay", false],
    ["https://evil.example/?https://checkout.stripe.com", false],
    ["javascript:alert(1)", false],
    ["not a url", false],
    ["", false],
    [null, false],
  ])("%p → %p", (url, expected) => {
    expect(isStripeCheckoutUrl(url)).toBe(expected)
  })
})
