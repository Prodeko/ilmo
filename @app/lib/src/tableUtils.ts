import {
  EventPage_QuestionFragment,
  ListEventRegistrations_RegistrationFragment,
} from "@app/graphql"
import dayjs from "dayjs"

import { CsvRow, filterObjectByKeys } from "."

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

export function downloadRegistrations(
  questions: EventPage_QuestionFragment[] | undefined
) {
  return (data: ListEventRegistrations_RegistrationFragment[]) => {
    return data.reduce((acc, cur) => {
      if (cur.isFinished) {
        const newRow = filterObjectByKeys(cur, registrationColsToDownload)
        Object.keys(newRow).map((key) => {
          if (key === "answers") {
            const answers = newRow[key]
            if (answers) {
              Object.keys(answers).forEach((questionId) => {
                const questionLabel = questions?.find(
                  (q) => q.id === questionId
                )?.label.fi
                const answer = answers[questionId]
                newRow[questionLabel] = answer
              })
            }
          } else if (key === "quota") {
            newRow[key] = newRow[key]?.title.fi
          } else {
            newRow[key] = newRow[key]
          }
        })
        delete newRow["answers"]
        acc.push(newRow as CsvRow)
      }
      return acc
    }, [] as CsvRow[])
  }
}
