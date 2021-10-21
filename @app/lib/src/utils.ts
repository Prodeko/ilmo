import isEqual from "lodash/isEqual"

export function isString(x: any): x is string {
  return typeof x === "string"
}

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

export const objectHasKey = (obj, key) =>
  Object.keys(obj).some((k) => k === key)

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
