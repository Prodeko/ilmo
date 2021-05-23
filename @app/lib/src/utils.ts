import dayjs from "dayjs"

export const filterObjectByKeys = (raw: object, allowed: string[]) =>
  raw &&
  Object.keys(raw)
    .filter((key) => allowed.includes(key))
    .reduce((obj, key) => {
      obj[key] = raw[key]
      return obj
    }, {})

export function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

/**
 * Table utils
 */

const numberSort = (a: number, b: number) => {
  if (a < b) return -1
  if (b < a) return 1
  return 0
}

const textSort = (a?: string, b?: string) => {
  return a?.localeCompare(b || "")
}

const dateSort = (dateA: Date, dateB: Date) => dayjs(dateA).diff(dayjs(dateB))

// See @app/client/src/pages/index.tsx and ServerPaginatedTable.tsx to understand
// how our table sorting setup works. More sorters can be added here if needed.
export const Sorter = {
  NUMBER: numberSort,
  TEXT: textSort,
  DATE: dateSort,
}
