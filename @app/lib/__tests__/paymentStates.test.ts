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
  test("during mode", () => {
    expect(
      registrationFormPaymentVariant(true, "DURING_REGISTRATION", 1800, false)
    ).toBe("during")
  })

  test("after mode", () => {
    expect(
      registrationFormPaymentVariant(true, "AFTER_REGISTRATION", 1800, false)
    ).toBe("after")
  })

  test("queued in either mode", () => {
    expect(
      registrationFormPaymentVariant(true, "DURING_REGISTRATION", 1800, true)
    ).toBe("queued")
    expect(
      registrationFormPaymentVariant(true, "AFTER_REGISTRATION", 1800, true)
    ).toBe("queued")
  })

  test("nothing when free, mode NONE or flag off", () => {
    expect(
      registrationFormPaymentVariant(true, "DURING_REGISTRATION", 0, true)
    ).toBeNull()
    expect(registrationFormPaymentVariant(true, "NONE", 1800, false)).toBe(null)
    expect(
      registrationFormPaymentVariant(false, "DURING_REGISTRATION", 1800, false)
    ).toBeNull()
  })
})

describe("payPageState", () => {
  const unpaid = { status: "UNPAID" as const, paidManually: false }

  test("payments disabled wins over everything", () => {
    expect(payPageState(false, unpaid)).toBe("disabled")
    expect(payPageState(false, null)).toBe("disabled")
  })

  test("not found", () => {
    expect(payPageState(true, null)).toBe("notFound")
    expect(payPageState(true, undefined)).toBe("notFound")
  })

  test("settled states", () => {
    expect(payPageState(true, { status: "PAID", paidManually: false })).toBe(
      "paid"
    )
    expect(payPageState(true, { status: "PAID", paidManually: true })).toBe(
      "paidManually"
    )
    expect(
      payPageState(true, { status: "PAID_MANUALLY", paidManually: true })
    ).toBe("paidManually")
    expect(
      payPageState(true, { status: "REFUNDED", paidManually: false })
    ).toBe("refunded")
    expect(
      payPageState(true, { status: "NOT_REQUIRED", paidManually: false })
    ).toBe("free")
  })

  test("settled states ignore the return status", () => {
    expect(
      payPageState(
        true,
        { status: "PAID", paidManually: false },
        { returnStatus: "success" }
      )
    ).toBe("paid")
  })

  test("blocked unpaid states", () => {
    expect(payPageState(true, { ...unpaid, blockedReason: "IN_QUEUE" })).toBe(
      "queued"
    )
    expect(
      payPageState(true, { ...unpaid, blockedReason: "PAYMENT_NOT_OPEN" })
    ).toBe("opensLater")
  })

  test("unpaid, cancelled and confirming", () => {
    expect(payPageState(true, unpaid)).toBe("unpaid")
    expect(payPageState(true, unpaid, { returnStatus: "cancelled" })).toBe(
      "unpaid"
    )
    expect(payPageState(true, unpaid, { returnStatus: "success" })).toBe(
      "confirming"
    )
    expect(
      payPageState(true, unpaid, {
        returnStatus: "success",
        confirmTimedOut: true,
      })
    ).toBe("unpaid")
  })
})

describe("cancelRefund", () => {
  test("card payment refunds the ticket price only", () => {
    expect(
      cancelRefund({
        status: "PAID",
        paidManually: false,
        paidTotalCents: 1825,
        paidTicketCents: 1800,
      })
    ).toEqual({ paidCents: 1825, serviceFeeCents: 25, refundCents: 1800 })
  })

  test("uses the stored ticket amount, not the current fee", () => {
    expect(
      cancelRefund({
        status: "PAID",
        paidManually: false,
        paidTotalCents: 1830,
        paidTicketCents: 1800,
      })
    ).toEqual({ paidCents: 1830, serviceFeeCents: 30, refundCents: 1800 })
  })

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
