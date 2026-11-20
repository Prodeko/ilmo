import { PoolClient } from "pg"

import {
  asRoot,
  becomeUser,
  createEventCategories,
  createOrganizations,
  upsertFeatureFlag,
  withAdminUserDb,
} from "../../helpers"

/*
 * Round-trip test for the event write path.
 *
 * `app_public.create_event` and `app_public.update_event` are redefined in
 * full whenever an attribute is added to one of their input types. A body
 * written on top of an older version silently stops persisting an attribute
 * that another change added. This test reads the attributes of every input
 * type from the catalog, sends a value for each one through both functions
 * and reads the stored rows back, so a new attribute is covered without
 * editing this file, as long as a value generator exists for its type.
 *
 * Every event is written twice: created with one variant of the values and
 * updated with the other. Two events run the variants in opposite order, so
 * both values of every attribute go through both functions. The variants
 * differ for every attribute, which makes an update that keeps the old value
 * fail, and one of them always differs from the column default, which makes
 * a create that leaves the column out fail.
 *
 * Adding an attribute: if its type has no entry in GENERATORS_BY_TYPE, add
 * one there (or, when the attribute has constraints of its own, a per
 * attribute entry in OVERRIDES). An attribute that is deliberately not stored
 * in a column of the same name goes into NOT_COLUMNS with the reason.
 */

type Variant = 0 | 1

interface InputType {
  /** Composite type in app_public that create_event / update_event take. */
  name: string
  /** Table in app_public that stores the attributes. */
  table: string
}

const EVENT_INPUT: InputType = { name: "event_input", table: "events" }
const CREATE_QUOTAS: InputType = {
  name: "create_event_quotas",
  table: "quotas",
}
const UPDATE_QUOTAS: InputType = {
  name: "update_event_quotas",
  table: "quotas",
}
const CREATE_QUESTIONS: InputType = {
  name: "create_event_questions",
  table: "event_questions",
}
const UPDATE_QUESTIONS: InputType = {
  name: "update_event_questions",
  table: "event_questions",
}
const INPUT_TYPES = [
  EVENT_INPUT,
  CREATE_QUOTAS,
  UPDATE_QUOTAS,
  CREATE_QUESTIONS,
  UPDATE_QUESTIONS,
]

interface Attribute {
  name: string
  /** Schema qualified type name, `[]` appended for arrays. */
  type: string
  /** Labels in sort order when the type is an enum. */
  enumLabels: string[] | null
  /** Whether the table has a column of the same name and (base) type. */
  hasColumn: boolean
}

interface GeneratorContext {
  variant: Variant
  /** Unique per event, keeps unique columns (slug) apart. */
  tag: string
  attribute: Attribute
  organizationIds: [string, string]
  categoryIds: [string, string]
  /** Id of the existing quota or question row in an update. */
  rowId: string | null
}

type Generator = (ctx: GeneratorContext) => unknown

const text = ({ attribute, tag, variant }: GeneratorContext) =>
  `${attribute.name}-${tag}-v${variant}`

const translated = (ctx: GeneratorContext) => ({
  fi: `${text(ctx)} fi`,
  en: `${text(ctx)} en`,
})

const BASE_TIME = Date.parse("2031-03-03T12:00:00Z")
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const timeAt =
  (days: number): Generator =>
  ({ variant }) =>
    new Date(BASE_TIME + days * DAY + variant * HOUR).toISOString()

/*
 * Values by type. Each generator returns a different value for variant 0 and
 * variant 1. Values are sent as JSON and converted with
 * jsonb_populate_record, so they use the JSON form of the type. Enums need
 * no entry: they take their first and second label.
 */
const GENERATORS_BY_TYPE: Record<string, Generator> = {
  "pg_catalog.text": text,
  "public.citext": text,
  "pg_catalog.bool": ({ variant }) => variant === 1,
  "pg_catalog.int2": ({ variant }) => 100 + variant,
  "pg_catalog.int4": ({ variant }) => 100 + variant,
  "pg_catalog.jsonb": (ctx) => ({ [ctx.attribute.name]: text(ctx) }),
  "pg_catalog.timestamptz": timeAt(30),
  "app_public.translated_field": translated,
  "app_public.translated_field[]": (ctx) => [translated(ctx)],
}

/*
 * Values for single attributes whose constraints a value by type cannot
 * meet: ordered timestamps, foreign keys, the id an update matches on,
 * jsonb stored in a translated_field column and question types, options and
 * prefills that depend on each other.
 */
const rowId: Generator = ({ rowId }) => rowId
// Only a TEXT question can prefill its answer, and a TEXT question has no
// answer options, so variant 0 is a prefilled TEXT question and variant 1 a
// RADIO question with options
const questionType: Generator = ({ variant }) =>
  (["TEXT", "RADIO"] as const)[variant]
const questionData: Generator = (ctx) =>
  ctx.variant === 0 ? null : [translated(ctx)]
const questionPrefill: Generator = ({ variant }) =>
  variant === 0 ? "TELEGRAM" : null
const questionOverrides = {
  type: questionType,
  data: questionData,
  prefill: questionPrefill,
}

const OVERRIDES: Record<string, Record<string, Generator>> = {
  [EVENT_INPUT.name]: {
    registration_start_time: timeAt(0),
    registration_end_time: timeAt(1),
    event_start_time: timeAt(2),
    event_end_time: timeAt(3),
    owner_organization_id: ({ organizationIds, variant }) =>
      organizationIds[variant],
    category_id: ({ categoryIds, variant }) => categoryIds[variant],
  },
  // Typed jsonb in the input, stored in a translated_field column
  [CREATE_QUOTAS.name]: { title: translated },
  [UPDATE_QUOTAS.name]: { id: rowId, title: translated },
  [CREATE_QUESTIONS.name]: questionOverrides,
  [UPDATE_QUESTIONS.name]: { id: rowId, ...questionOverrides },
}

/*
 * Attributes that are deliberately not stored in a column of the same name,
 * with the reason. They are sent as null and not read back.
 */
const NOT_COLUMNS: Record<string, Record<string, string>> = {}

/******************************************************************************/

async function loadAttributes(
  client: PoolClient,
  inputType: InputType
): Promise<Attribute[]> {
  const { rows } = await client.query(
    `select
       a.attname as name,
       case
         when et.oid is not null then etn.nspname || '.' || et.typname || '[]'
         else tn.nspname || '.' || t.typname
       end as type,
       case when t.typtype = 'e' then array(
         select e.enumlabel::text from pg_catalog.pg_enum as e
         where e.enumtypid = t.oid order by e.enumsortorder
       ) end as enum_labels,
       c.attname is not null as has_column
     from pg_catalog.pg_attribute as a
     join pg_catalog.pg_type as t on t.oid = a.atttypid
     join pg_catalog.pg_namespace as tn on tn.oid = t.typnamespace
     left join pg_catalog.pg_type as et
       on t.typcategory = 'A' and et.oid = t.typelem
     left join pg_catalog.pg_namespace as etn on etn.oid = et.typnamespace
     left join (
       pg_catalog.pg_attribute as c
       join pg_catalog.pg_type as ct on ct.oid = c.atttypid
     )
       on c.attrelid = to_regclass('app_public.' || $2)
       and c.attname = a.attname
       and c.attnum > 0
       and not c.attisdropped
       -- A domain column (translated_field) may take an attribute of its
       -- base type (jsonb)
       and a.atttypid in (c.atttypid, ct.typbasetype)
     where a.attrelid = to_regclass('app_public.' || $1)
       and a.attnum > 0
       and not a.attisdropped
     order by a.attnum`,
    [inputType.name, inputType.table]
  )
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    enumLabels: row.enum_labels,
    hasColumn: row.has_column,
  }))
}

function generatorFor(
  inputType: InputType,
  attribute: Attribute
): Generator | null {
  const override = OVERRIDES[inputType.name]?.[attribute.name]
  if (override) {
    return override
  }
  if (attribute.enumLabels && attribute.enumLabels.length >= 2) {
    const labels = attribute.enumLabels
    return ({ variant }) => labels[variant]
  }
  return GENERATORS_BY_TYPE[attribute.type] ?? null
}

const isRoundTripped = (inputType: InputType, attribute: Attribute) =>
  !NOT_COLUMNS[inputType.name]?.[attribute.name]

/** Problems that stop the round trip before any function is called. */
function setupProblems(
  inputType: InputType,
  attributes: Attribute[]
): string[] {
  const where = `app_public.${inputType.name}`
  if (attributes.length === 0) {
    return [
      `${where} has no attributes or does not exist. Update INPUT_TYPES in this test.`,
    ]
  }
  return attributes.flatMap((attribute) => {
    if (!isRoundTripped(inputType, attribute)) {
      return []
    }
    const problems: string[] = []
    if (!generatorFor(inputType, attribute)) {
      problems.push(
        `${where}.${attribute.name} (${attribute.type}) has no value generator. ` +
          `Add one for the type to GENERATORS_BY_TYPE, or for the attribute to OVERRIDES, in this test.`
      )
    }
    if (!attribute.hasColumn) {
      problems.push(
        `${where}.${attribute.name} (${attribute.type}) has no column of the same name and type in app_public.${inputType.table}. ` +
          `Add the column, or list the attribute in NOT_COLUMNS in this test with the reason.`
      )
    }
    return problems
  })
}

function buildInput(
  inputType: InputType,
  attributes: Attribute[],
  ctx: Omit<GeneratorContext, "attribute">
): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  for (const attribute of attributes) {
    if (!isRoundTripped(inputType, attribute)) {
      input[attribute.name] = null
      continue
    }
    const generator = generatorFor(inputType, attribute)
    if (!generator) {
      throw new Error(
        `No value generator for app_public.${inputType.name}.${attribute.name} (${attribute.type})`
      )
    }
    input[attribute.name] = generator({ ...ctx, attribute })
  }
  return input
}

/** The input as Postgres stores it, in the JSON form of to_jsonb. */
async function normalize(
  client: PoolClient,
  inputType: InputType,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const {
    rows: [{ value }],
  } = await client.query(
    `select to_jsonb(jsonb_populate_record(null::app_public.${inputType.name}, $1::jsonb)) as value`,
    [JSON.stringify(input)]
  )
  return value
}

async function readRows(
  client: PoolClient,
  table: string,
  column: "id" | "event_id",
  id: string
): Promise<Record<string, unknown>[]> {
  const { rows } = await asRoot(client, () =>
    client.query(
      `select to_jsonb(t) as value from app_public.${table} as t where t.${column} = $1`,
      [id]
    )
  )
  return rows.map((row) => row.value)
}

/******************************************************************************/

describe("Round trip of event input types through create_event and update_event", () => {
  it("every input attribute has a value generator and a column", () =>
    withAdminUserDb(async (client) => {
      const problems: string[] = []
      for (const inputType of INPUT_TYPES) {
        const attributes = await loadAttributes(client, inputType)
        problems.push(...setupProblems(inputType, attributes))
      }
      expect(problems).toEqual([])
    }))

  it("create_event and update_event persist every input attribute", () =>
    withAdminUserDb(async (client, user) => {
      const [organization0, organization1] = await createOrganizations(
        client,
        2
      )
      const [category0] = await createEventCategories(
        client,
        1,
        organization0.id
      )
      const [category1] = await createEventCategories(
        client,
        1,
        organization1.id
      )
      // The fixture helpers switch to the root role, run as the admin again
      await becomeUser(client, user.id)
      // Paid payment settings are refused while payments are off
      await upsertFeatureFlag(client, "payments", "on")

      const attributes: Record<string, Attribute[]> = {}
      const problems: string[] = []
      for (const inputType of INPUT_TYPES) {
        attributes[inputType.name] = await loadAttributes(client, inputType)
        problems.push(...setupProblems(inputType, attributes[inputType.name]))
      }
      if (problems.length > 0) {
        throw new Error(problems.join("\n"))
      }

      const runId = Date.now().toString(36)
      const failures: string[] = []

      const input = async (
        inputType: InputType,
        variant: Variant,
        tag: string,
        rowId: string | null = null
      ) => {
        const raw = buildInput(inputType, attributes[inputType.name], {
          variant,
          tag,
          organizationIds: [organization0.id, organization1.id],
          categoryIds: [category0.id, category1.id],
          rowId,
        })
        return { raw, sent: await normalize(client, inputType, raw) }
      }

      const compare = (
        fn: string,
        inputType: InputType,
        sent: Record<string, unknown>,
        stored: Record<string, unknown>[]
      ) => {
        if (stored.length !== 1) {
          failures.push(
            `${fn}: expected 1 row in app_public.${inputType.table}, found ${stored.length}`
          )
          return
        }
        for (const attribute of attributes[inputType.name]) {
          if (!isRoundTripped(inputType, attribute)) {
            continue
          }
          const expected = sent[attribute.name]
          const actual = stored[0][attribute.name]
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failures.push(
              `${fn} did not persist app_public.${inputType.name}.${attribute.name}: ` +
                `sent ${JSON.stringify(expected)}, stored ${JSON.stringify(actual)}`
            )
          }
        }
      }

      const checkVariantsDiffer = (
        inputType: InputType,
        first: Record<string, unknown>,
        second: Record<string, unknown>
      ) => {
        for (const attribute of attributes[inputType.name]) {
          if (
            isRoundTripped(inputType, attribute) &&
            OVERRIDES[inputType.name]?.[attribute.name] !== rowId &&
            JSON.stringify(first[attribute.name]) ===
              JSON.stringify(second[attribute.name])
          ) {
            failures.push(
              `The value generator for app_public.${inputType.name}.${attribute.name} ` +
                `returns the same value for both variants, so update_event is not tested for it`
            )
          }
        }
      }

      for (const createVariant of [0, 1] as const) {
        const updateVariant: Variant = createVariant === 0 ? 1 : 0
        const tag = `${runId}-e${createVariant}`

        // create_event
        const event = await input(EVENT_INPUT, createVariant, tag)
        const quota = await input(CREATE_QUOTAS, createVariant, tag)
        const question = await input(CREATE_QUESTIONS, createVariant, tag)
        const {
          rows: [{ id: eventId }],
        } = await client.query(
          `select (app_public.create_event(
             jsonb_populate_record(null::app_public.event_input, $1::jsonb),
             array[jsonb_populate_record(null::app_public.create_event_quotas, $2::jsonb)],
             array[jsonb_populate_record(null::app_public.create_event_questions, $3::jsonb)]
           )).id`,
          [
            JSON.stringify(event.raw),
            JSON.stringify(quota.raw),
            JSON.stringify(question.raw),
          ]
        )
        const createdQuotas = await readRows(
          client,
          "quotas",
          "event_id",
          eventId
        )
        const createdQuestions = await readRows(
          client,
          "event_questions",
          "event_id",
          eventId
        )
        compare(
          "create_event",
          EVENT_INPUT,
          event.sent,
          await readRows(client, "events", "id", eventId)
        )
        compare("create_event", CREATE_QUOTAS, quota.sent, createdQuotas)
        compare(
          "create_event",
          CREATE_QUESTIONS,
          question.sent,
          createdQuestions
        )
        if (createdQuotas.length !== 1 || createdQuestions.length !== 1) {
          break
        }

        // update_event, with the other variant
        const newEvent = await input(EVENT_INPUT, updateVariant, tag)
        const newQuota = await input(
          UPDATE_QUOTAS,
          updateVariant,
          tag,
          createdQuotas[0].id as string
        )
        const newQuestion = await input(
          UPDATE_QUESTIONS,
          updateVariant,
          tag,
          createdQuestions[0].id as string
        )
        checkVariantsDiffer(EVENT_INPUT, event.sent, newEvent.sent)
        checkVariantsDiffer(UPDATE_QUOTAS, quota.sent, newQuota.sent)
        checkVariantsDiffer(UPDATE_QUESTIONS, question.sent, newQuestion.sent)
        await client.query(
          `select app_public.update_event(
             $1::uuid,
             jsonb_populate_record(null::app_public.event_input, $2::jsonb),
             array[jsonb_populate_record(null::app_public.update_event_quotas, $3::jsonb)],
             array[jsonb_populate_record(null::app_public.update_event_questions, $4::jsonb)]
           )`,
          [
            eventId,
            JSON.stringify(newEvent.raw),
            JSON.stringify(newQuota.raw),
            JSON.stringify(newQuestion.raw),
          ]
        )
        compare(
          "update_event",
          EVENT_INPUT,
          newEvent.sent,
          await readRows(client, "events", "id", eventId)
        )
        compare(
          "update_event",
          UPDATE_QUOTAS,
          newQuota.sent,
          await readRows(client, "quotas", "event_id", eventId)
        )
        compare(
          "update_event",
          UPDATE_QUESTIONS,
          newQuestion.sent,
          await readRows(client, "event_questions", "event_id", eventId)
        )
      }

      expect(failures).toEqual([])
    }))
})
