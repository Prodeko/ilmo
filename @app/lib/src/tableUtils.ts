import {
  EventPage_QuestionFragment,
  ListEventRegistrations_RegistrationFragment,
} from "@app/graphql"
import dayjs from "dayjs"

import { formatEuro } from "./payments"
import { CsvRow } from "./types"
import { filterObjectByKeys } from "./utils"

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

/**
 * Download utils
 */

const registrationColsToDownload = [
  "fullName",
  "email",
  "quota",
  "status",
  "position",
  "answers",
]

interface DownloadRegistrationsOptions {
  /**
   * Adds the payment status and ticket price columns. Only set when payments
   * are on for the site and the event, so the CSV is unchanged otherwise.
   */
  includePayments?: boolean
  /**
   * The text written for a payment status (for example a translated label);
   * the raw status (PAID, PAID_MANUALLY, ...) by default.
   */
  paymentStatusLabel?: (status: string) => string
}

/**
 * Returns a copy of a CSV row with the payment status and ticket price columns
 * inserted right after the quota column, before the answer columns. A
 * question whose label is already "paymentStatus" or "price" keeps its
 * column; the payment column then gets a " (Ilmo)" suffix.
 */
function withPaymentColumns(
  row: Record<string, any>,
  registration: ListEventRegistrations_RegistrationFragment,
  paymentStatusLabel: (status: string) => string
) {
  const columnName = (name: string) => (name in row ? `${name} (Ilmo)` : name)
  const paymentColumns = {
    [columnName("paymentStatus")]: registration.paymentStatus
      ? paymentStatusLabel(registration.paymentStatus)
      : "",
    [columnName("price")]:
      registration.priceCents != null
        ? formatEuro(registration.priceCents)
        : "",
  }
  return Object.keys(row).reduce(
    (acc, key) =>
      key === "quota"
        ? { ...acc, [key]: row[key], ...paymentColumns }
        : { ...acc, [key]: row[key] },
    {} as Record<string, any>
  )
}

export function downloadRegistrations(
  questions: EventPage_QuestionFragment[] | undefined,
  options: DownloadRegistrationsOptions = {}
) {
  const {
    includePayments = false,
    paymentStatusLabel = (status: string) => status,
  } = options
  return (data: ListEventRegistrations_RegistrationFragment[]) => {
    return data.reduce((acc, cur) => {
      if (cur.isFinished) {
        const newRow: Record<string, any> = filterObjectByKeys(
          cur,
          registrationColsToDownload
        )
        Object.keys(newRow).map((key) => {
          if (key === "answers") {
            const answers = newRow[key]
            if (answers) {
              Object.keys(answers).forEach((questionId) => {
                const questionLabel = questions?.find(
                  (q) => q.id === questionId
                )?.label?.fi
                const answer = answers[questionId]
                if (questionLabel) {
                  newRow[questionLabel] = answer
                }
              })
            }
          } else if (key === "quota") {
            newRow[key] = newRow[key]?.title?.fi
          }
        })
        delete newRow["answers"]
        acc.push(
          (includePayments
            ? withPaymentColumns(newRow, cur, paymentStatusLabel)
            : newRow) as CsvRow
        )
      }
      return acc
    }, [] as CsvRow[])
  }
}
