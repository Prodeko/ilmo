import { QuestionType } from "@app/graphql"
import { PoolClient } from "pg"

import { withUserDb } from "../../helpers"

async function checkQuestionData(
  client: PoolClient,
  type: QuestionType,
  data: string[]
) {
  const {
    rows: [row],
  } = await client.query(
    `select * from app_public.check_question_data($1, $2) `,
    [type, data]
  )
  return row
}

it("type: TEXT and data: null is valid", () =>
  withUserDb(async (client) => {
    const { check_question_data } = await checkQuestionData(
      client,
      QuestionType.Text,
      null
    )
    expect(check_question_data).toEqual(true)
  }))

it("type: TEXT and data: [] is not valid", () =>
  withUserDb(async (client) => {
    const { check_question_data } = await checkQuestionData(
      client,
      QuestionType.Text,
      []
    )
    expect(check_question_data).toEqual(false)
  }))

it("type: TEXT and data: [question?] is not valid", () =>
  withUserDb(async (client) => {
    const { check_question_data } = await checkQuestionData(
      client,
      QuestionType.Text,
      ["question?"]
    )
    expect(check_question_data).toEqual(false)
  }))

for (const type of [QuestionType.Radio, QuestionType.Checkbox]) {
  for (const data of [null, []]) {
    const repr = data?.length < 1 ? "[]" : data ?? "null"
    it(`type: ${type} and data: ${repr} is not valid`, () =>
      withUserDb(async (client) => {
        const { check_question_data } = await checkQuestionData(
          client,
          type,
          data
        )
        expect(check_question_data).toEqual(false)
      }))
  }

  for (const data of [["question?"], ["question?", "another?"]]) {
    it(`type: ${type} and data: [${data}] is valid`, () =>
      withUserDb(async (client) => {
        const { check_question_data } = await checkQuestionData(
          client,
          type,
          data
        )
        expect(check_question_data).toEqual(true)
      }))
  }
}
