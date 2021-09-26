import dayjs from "dayjs"
import isEqual from "lodash/isEqual"

export const arePropsEqual = (prevProps: any, nextProps: any) => {
  return isEqual(prevProps, nextProps)
}

export const filterObjectByKeys = <T>(raw: T, allowed: string[]): T =>
  raw &&
  Object.keys(raw)
    .filter((key) => allowed.includes(key))
    .reduce((obj, key) => {
      obj[key] = raw[key]
      return obj
    }, {} as T)

export const randomElementFromArray = (arr: any[]) =>
  arr[Math.floor(Math.random() * arr.length)]

export const range = (start: number, end: number) => {
  const result = []
  for (let i = start; i < end; i++) {
    // @ts-ignore
    result.push(i)
  }
  return result
}

/**
 * Table utils
 */

const numberSort = (a: number, b: number) => {
  if (a < b) return -1
  if (b < a) return 1
  return 0
}

const textSort = (a: string, b: string) => {
  return a.localeCompare(b || "")
}

const dateSort = (dateA: Date, dateB: Date) => dayjs(dateA).diff(dayjs(dateB))

// See @app/client/src/pages/index.tsx and ServerPaginatedTable.tsx to understand
// how our table sorting setup works. More sorters can be added here if needed.
export const Sorter = {
  NUMBER: numberSort,
  TEXT: textSort,
  DATE: dateSort,
}
