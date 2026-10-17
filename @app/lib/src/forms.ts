export const formItemLayout = {
  labelCol: {
    xs: { span: 24 },
    sm: { span: 6 },
  },
  wrapperCol: {
    xs: { span: 24 },
    md: { span: 12 },
    sm: { span: 18 },
  },
}

export const tailFormItemLayout = {
  wrapperCol: {
    xs: {
      span: 24,
      offset: 0,
    },
    sm: {
      span: 18,
      offset: 6,
    },
  },
}

// Use narrower form items for the registration form
export const registrationFormItemLayout = {
  labelCol: {
    xs: { span: 24 },
    sm: { span: 6 },
  },
  wrapperCol: {
    xs: { span: 24 },
    sm: { span: 12 },
  },
}

/**
 * Converts a ticket price entered in euros (the event form's price input) to
 * integer cents. An empty input means a free ticket. Returns NaN for input
 * that isn't a number, which isValidTicketPriceCents rejects.
 */
export function ticketPriceEurosToCents(
  euros: number | string | null | undefined
): number {
  if (euros === null || euros === undefined || euros === "") return 0
  const value = typeof euros === "number" ? euros : Number(euros)
  return Math.round(value * 100)
}

/** Converts integer cents to euros for the event form's price input. */
export function ticketPriceCentsToEuros(
  cents: number | null | undefined
): number | undefined {
  return cents === null || cents === undefined ? undefined : cents / 100
}
