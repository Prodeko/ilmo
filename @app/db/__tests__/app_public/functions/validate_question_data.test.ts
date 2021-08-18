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
    `select * from app_public.validate_question_data($1, $2) `,
    [type, data]
  )
  return row
}

const questions = [
  {
    repr: "null",
    data: null,
    expected: {
      TEXT: true,
      RADIO: false,
      CHECKBOX: false,
    },
  },
  {
    repr: "[]",
    data: [],
    expected: {
      TEXT: false,
      RADIO: false,
      CHECKBOX: false,
    },
  },
  {
    repr: "[null]",
    data: [null],
    expected: {
      TEXT: false,
      RADIO: false,
      CHECKBOX: false,
    },
  },
  {
    repr: "[null, null]",
    data: [null, null],
    expected: {
      TEXT: false,
      RADIO: false,
      CHECKBOX: false,
    },
  },
  {
    repr: "[{ fi: null, en: 'Valid' }]",
    data: [null, null],
    expected: {
      TEXT: false,
      RADIO: false,
      CHECKBOX: false,
    },
  },
  {
    repr: '[{ fi: "Kysymys 1", en: "Question 1" }]',
    data: [{ fi: "Kysymys 1", en: "Question 1" }],
    expected: {
      TEXT: false,
      RADIO: true,
      CHECKBOX: true,
    },
  },
  {
    repr: '[{ fi: "Kysymys 1", en: "Question 1" }, { fi: "Kysymys 2", en: "Question 2" }]',
    data: [
      { fi: "Kysymys 1", en: "Question 1" },
      { fi: "Kysymys 2", en: "Question 2" },
    ],
    expected: {
      TEXT: false,
      RADIO: true,
      CHECKBOX: true,
    },
  },
]

for (const type of [
  QuestionType.Text,
  QuestionType.Radio,
  QuestionType.Checkbox,
]) {
  for (const { repr, data, expected } of questions) {
    it(`type: ${type} and data: ${repr} is ${expected[type]}`, () =>
      withUserDb(async (client) => {
        const { validate_question_data } = await checkQuestionData(
          client,
          type,
          data
        )
        expect(validate_question_data).toEqual(expected[type])
      }))
  }
}
