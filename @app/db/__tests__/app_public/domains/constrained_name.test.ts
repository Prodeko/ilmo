import { withRootDb } from "../../helpers"

import type { PoolClient } from "pg"

const castToName = (client: PoolClient, name: string) =>
  client.query("select $1::app_public.constrained_name as name", [name])

describe("Test app_public.constrained_name domain", () => {
  it.each(["Maijuli", "Maijuli Kielo", "Juokko Tuoppo", "Anna-Liisa"])(
    "accepts the name %p",
    (name) =>
      withRootDb(async (client) => {
        const {
          rows: [row],
        } = await castToName(client, name)
        expect(row.name).toEqual(name)
      })
  )

  it.each([" ", "   ", " Maijuli", "Maijuli ", "\tMaijuli"])(
    "rejects the name %p",
    (name) =>
      withRootDb(async (client) => {
        await expect(castToName(client, name)).rejects.toThrow(
          /constrained_name_check/
        )
      })
  )
})
