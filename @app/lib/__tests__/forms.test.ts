import { ticketPriceEurosToCents } from "../src/forms"

describe("ticketPriceEurosToCents", () => {
  test.each([
    [undefined, 0],
    [null, 0],
    ["", 0],
    [0, 0],
    [0.25, 25],
    [0.29, 29],
    [18, 1800],
    [19.99, 1999],
    ["22.5", 2250],
    // Input that isn't a number gives NaN (toBe compares with Object.is)
    ["abc", NaN],
  ])("%p € is %p cents", (euros, cents) => {
    expect(ticketPriceEurosToCents(euros)).toBe(cents)
  })
})
