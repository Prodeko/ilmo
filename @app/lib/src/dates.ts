import dayjs, { Dayjs } from "dayjs"

export function getFormattedEventTime(
  start: string | Dayjs,
  end: string | Dayjs
) {
  const formatString = "D.M.YY HH:mm"
  const eventStartTime = dayjs(start).format(formatString)
  const eventEndTime = dayjs(end).format(formatString)
  return `${eventStartTime} - ${eventEndTime}`
}
