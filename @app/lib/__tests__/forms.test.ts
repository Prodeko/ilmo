import { ticketPriceCentsToEuros, ticketPriceEurosToCents } from "../src/forms"

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
  ])("%p € is %p cents", (euros, cents) => {
    expect(ticketPriceEurosToCents(euros)).toBe(cents)
  })

  test("returns NaN for input that isn't a number", () => {
    expect(ticketPriceEurosToCents("abc")).toBeNaN()
  })
})

describe("ticketPriceCentsToEuros", () => {
  test.each([
    [undefined, undefined],
    [null, undefined],
    [0, 0],
    [1800, 18],
    [1999, 19.99],
  ])("%p cents is %p €", (cents, euros) => {
    expect(ticketPriceCentsToEuros(cents)).toBe(euros)
  })
})
