import type { Dayjs } from "dayjs"

/**
 * The range a click on a new start day fills in: from 12:00 that day to
 * 23:59:59 `endAfterDays` days later.
 */
export function dayClickRange(day: Dayjs, endAfterDays: number) {
  const start = day.hour(12).minute(0).second(0).millisecond(0)
  const end = day
    .add(endAfterDays, "day")
    .hour(23)
    .minute(59)
    .second(59)
    .millisecond(0)
  return [start, end] as [Dayjs, Dayjs]
}
