import dayjs from "dayjs"

import { dayClickRange } from "../../src/EventForm/timeRange"

const format = "YYYY-MM-DD HH:mm:ss.SSS"

describe("dayClickRange", () => {
  const day = dayjs("2030-05-01T08:15:30.250")

  it("fills a single day from noon to the end of the day", () => {
    const [start, end] = dayClickRange(day, 0)
    expect(start.format(format)).toBe("2030-05-01 12:00:00.000")
    expect(end.format(format)).toBe("2030-05-01 23:59:59.000")
  })

  it("ends the range the given number of days later", () => {
    const [start, end] = dayClickRange(day, 7)
    expect(start.format(format)).toBe("2030-05-01 12:00:00.000")
    expect(end.format(format)).toBe("2030-05-08 23:59:59.000")
  })

  it("crosses a month end", () => {
    const [, end] = dayClickRange(dayjs("2030-04-28T00:00:00"), 7)
    expect(end.format(format)).toBe("2030-05-05 23:59:59.000")
  })
})
