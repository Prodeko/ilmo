import { QuestionType } from "@app/graphql"
import { PoolClient } from "pg"

import { withUserDb } from "../../helpers"

async function checkQuestionData(
  client: PoolClient,
  type: QuestionType,
  data?: any
) {
  const {
    rows: [row],
  } = await client.query(
    `select * from app_public.check_question_data($1, $2) `,
    [type, data]
  )
  return row
}

const questions = [
  [
    ['{ fi: "Kysymys 1", en: "Question 1" }'],
    [{ fi: "Kysymys 1", en: "Question 1" }],
  ],
  [
    '[{ fi: "Kysymys 2", en: "Question 2" }, { fi: "Kysymys 2", en: "Question 2" }]',
    [
      { fi: "Kysymys 1", en: "Question 1" },
      { fi: "Kysymys 2", en: "Question 2" },
    ],
  ],
]

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

it("type: TEXT and data: [{ fi: 'Kysymys',  en: 'Question'}] is not valid", () =>
  withUserDb(async (client) => {
    const { check_question_data } = await checkQuestionData(
      client,
      QuestionType.Text,
      questions[0][1]
    )
    expect(check_question_data).toEqual(false)
  }))

const possibleMissingData = [
  ["null", null],
  ["[]", []],
  ["[null]", [null]],
  ["[null, null]", [null, null]],
]
for (const type of [QuestionType.Radio, QuestionType.Checkbox]) {
  for (const [repr, data] of possibleMissingData) {
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
}

for (const type of [QuestionType.Radio, QuestionType.Checkbox]) {
  for (const [repr, data] of questions) {
    it(`type: ${type} and data: [${repr}] is valid`, () =>
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
