import {
  cancelRefund,
  isStripeCheckoutUrl,
  payPageState,
  quotaRequiresPayment,
  registrationFormPaymentVariant,
} from "../src/paymentStates"

describe("quotaRequiresPayment", () => {
  test.each([
    [true, "DURING_REGISTRATION", 1800, true],
    [true, "AFTER_REGISTRATION", 25, true],
    [true, "DURING_REGISTRATION", 0, false],
    [true, "NONE", 1800, false],
    [false, "DURING_REGISTRATION", 1800, false],
    [true, null, 1800, false],
    [true, "DURING_REGISTRATION", null, false],
  ] as const)("enabled=%p mode=%p price=%p → %p", (on, mode, price, out) => {
    expect(quotaRequiresPayment(on, mode, price)).toBe(out)
  })
})

describe("registrationFormPaymentVariant", () => {
  test.each([
    [true, "DURING_REGISTRATION", 1800, false, "during"],
    [true, "AFTER_REGISTRATION", 1800, false, "after"],
    [true, "DURING_REGISTRATION", 1800, true, "queued"],
    [true, "AFTER_REGISTRATION", 1800, true, "queued"],
    [true, "DURING_REGISTRATION", 0, true, null],
    [true, "NONE", 1800, false, null],
    [false, "DURING_REGISTRATION", 1800, false, null],
  ] as const)(
    "enabled=%p mode=%p price=%p queued=%p → %p",
    (on, mode, price, queued, out) => {
      expect(registrationFormPaymentVariant(on, mode, price, queued)).toBe(out)
    }
  )
})

describe("payPageState", () => {
  const unpaid = { status: "UNPAID" as const, paidManually: false }
  const paid = { status: "PAID" as const, paidManually: false }

  test.each([
    // Payments disabled wins over everything
    ["disabled, unpaid", false, unpaid, undefined, "disabled"],
    ["disabled, no payment", false, null, undefined, "disabled"],
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
      "refunded",
      true,
      { status: "REFUNDED", paidManually: false },
      undefined,
      "refunded",
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

describe("cancelRefund", () => {
  test.each([
    // A card payment refunds the ticket price only
    [1825, 1800, { paidCents: 1825, serviceFeeCents: 25, refundCents: 1800 }],
    // Uses the stored ticket amount, not the current fee
    [1830, 1800, { paidCents: 1830, serviceFeeCents: 30, refundCents: 1800 }],
  ])(
    "a card payment of %i cents with a %i cent ticket refunds %p",
    (paidTotalCents, paidTicketCents, expected) => {
      expect(
        cancelRefund({
          status: "PAID",
          paidManually: false,
          paidTotalCents,
          paidTicketCents,
        })
      ).toEqual(expected)
    }
  )

  test("nothing for manual, unpaid, refunded or unknown payments", () => {
    expect(
      cancelRefund({
        status: "PAID",
        paidManually: true,
        paidTotalCents: 1825,
        paidTicketCents: 1800,
      })
    ).toBeNull()
    expect(
      cancelRefund({ status: "PAID_MANUALLY", paidManually: true })
    ).toBeNull()
    expect(cancelRefund({ status: "UNPAID", paidManually: false })).toBeNull()
    expect(
      cancelRefund({
        status: "REFUNDED",
        paidManually: false,
        paidTotalCents: 1825,
        paidTicketCents: 1800,
      })
    ).toBeNull()
    expect(
      cancelRefund({
        status: "PAID",
        paidManually: false,
        paidTotalCents: null,
      })
    ).toBeNull()
    expect(cancelRefund(null)).toBeNull()
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
