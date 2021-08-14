import { PoolClient } from "pg"

import { withUserDb } from "../../helpers"

async function checkJsonb(client: PoolClient, json: any) {
  const {
    rows: [row],
  } = await client.query({
    text: `select * from app_public.validate_jsonb_no_nulls($1::jsonb) `,
    values: [JSON.stringify(json)],
  })
  return row
}

const invalidJsonData = [
  ["null", null],
  ["[]", []],
  ["[null]", [null]],
  ["[null, null]", [null, null]],
]
for (const [repr, json] of invalidJsonData) {
  it(`data: ${repr} is not valid`, async () =>
    withUserDb(async (client) => {
      // Action
      const promise = checkJsonb(client, json)

      // Assertions
      await expect(promise).rejects.toMatchInlineSnapshot(
        `[error: Invalid json data]`
      )
      await expect(promise).rejects.toHaveProperty("code", "NVLID")
    }))
}
