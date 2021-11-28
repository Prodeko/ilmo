import { SupportedLanguages } from "@app/graphql"
import { PoolClient } from "pg"

import { withUserDb } from "../../helpers"

type LanguageColumn = {
  [key in Lowercase<SupportedLanguages>]?: string
}

async function checkLanguage(
  client: PoolClient,
  languageColumn: LanguageColumn
) {
  const {
    rows: [row],
  } = await client.query(`select * from app_public.check_language($1) `, [
    JSON.stringify(languageColumn),
  ])
  return row
}

it("fi is a valid language", () =>
  withUserDb(async (client) => {
    const { check_language } = await checkLanguage(client, { fi: "Testi" })
    expect(check_language).toEqual(true)
  }))

it("en is a valid language", () =>
  withUserDb(async (client) => {
    const { check_language } = await checkLanguage(client, { en: "Test" })
    expect(check_language).toEqual(true)
  }))

it("se is a valid language", () =>
  withUserDb(async (client) => {
    const { check_language } = await checkLanguage(client, { se: "Testa" })
    expect(check_language).toEqual(true)
  }))

it("fi and en are both valid languages", () =>
  withUserDb(async (client) => {
    const { check_language } = await checkLanguage(client, {
      fi: "Testi",
      en: "Test",
    })
    expect(check_language).toEqual(true)
  }))

it("fi, en and se are all valid languages", () =>
  withUserDb(async (client) => {
    const { check_language } = await checkLanguage(client, {
      fi: "Testi",
      en: "Test",
      se: "Test",
    })
    expect(check_language).toEqual(true)
  }))

it("empty json is not a valid language", () =>
  withUserDb(async (client) => {
    const { check_language } = await checkLanguage(client, {})
    expect(check_language).toEqual(false)
  }))

it("Hebrew is not a valid language even when fi and en are provided", () =>
  withUserDb(async (client) => {
    const { check_language } = await checkLanguage(client, {
      fi: "Testi",
      en: "Test",
      // @ts-ignore
      he: "מִבְחָן",
    })
    expect(check_language).toEqual(false)
  }))
