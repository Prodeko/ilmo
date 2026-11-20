import {
  createEventCategories,
  createEvents,
  createOrganizations,
  createQuestions,
  withAdminUserDb,
} from "../../helpers"

describe("Test app_public.update_event_questions function", () => {
  it("deletes an omitted question also when the same call adds a new question", () =>
    withAdminUserDb(async (client) => {
      const [organization] = await createOrganizations(client, 1)
      const [eventCategory] = await createEventCategories(
        client,
        1,
        organization.id
      )
      const [event] = await createEvents(
        client,
        1,
        organization.id,
        eventCategory.id
      )
      const [keptQuestion, removedQuestion] = await createQuestions(
        client,
        2,
        event.id,
        false,
        "TEXT" as any
      )

      // The admin UI sends kept questions with their ids and newly added
      // questions without an id. removedQuestion is omitted, so it should
      // be deleted.
      await client.query(
        `select app_public.update_event_questions(
          $1,
          array[
            row($2::uuid, 0::smallint, 'TEXT'::app_public.question_type, $3::app_public.translated_field, false, null, null),
            row(null, 1::smallint, 'TEXT'::app_public.question_type, $4::app_public.translated_field, false, null, null)
          ]::app_public.update_event_questions[]
        )`,
        [
          event.id,
          keptQuestion.id,
          keptQuestion.label,
          { fi: "Uusi kysymys", en: "New question" },
        ]
      )

      const { rows: questions } = await client.query(
        `select id from app_public.event_questions where event_id = $1 order by position`,
        [event.id]
      )
      const questionIds = questions.map((q) => q.id)

      expect(questionIds).toHaveLength(2)
      expect(questionIds).toContain(keptQuestion.id)
      expect(questionIds).not.toContain(removedQuestion.id)
    }))

  it("keeps an omitted prefill and clears it with NONE or a non-TEXT type", () =>
    withAdminUserDb(async (client) => {
      const [organization] = await createOrganizations(client, 1)
      const [eventCategory] = await createEventCategories(
        client,
        1,
        organization.id
      )
      const [event] = await createEvents(
        client,
        1,
        organization.id,
        eventCategory.id
      )
      const label = { fi: "Telegram", en: "Telegram" }
      const option = { fi: "A", en: "A" }

      // Each call sends the given questions, in order, and returns their
      // stored prefills
      const update = async (
        questions: Array<{
          id: string | null
          type: string
          prefill: string | null
        }>
      ) => {
        const { rows } = await client.query(
          `select q.id, q.prefill
           from unnest(app_public.update_event_questions(
             $1,
             array(
               select row(
                 (x->>'id')::uuid,
                 (ord - 1)::smallint,
                 (x->>'type')::app_public.question_type,
                 $2::app_public.translated_field,
                 false,
                 case when x->>'type' = 'TEXT' then null else array[$3::app_public.translated_field] end,
                 (x->>'prefill')::app_public.question_prefill
               )::app_public.update_event_questions
               from jsonb_array_elements($4::jsonb) with ordinality as t(x, ord)
               order by ord
             )
           )) as q`,
          [event.id, label, option, JSON.stringify(questions)]
        )
        return rows as Array<{ id: string; prefill: string | null }>
      }

      const created = await update([
        { id: null, type: "TEXT", prefill: "TELEGRAM" },
        { id: null, type: "TEXT", prefill: "NONE" },
        { id: null, type: "TEXT", prefill: "TELEGRAM" },
      ])
      expect(created.map((q) => q.prefill)).toEqual([
        "TELEGRAM",
        null,
        "TELEGRAM",
      ])
      const [a, b, c] = created.map((q) => q.id)

      // Omitted (null) keeps; NONE clears; a non-TEXT type clears
      const omitted = await update([
        { id: a, type: "TEXT", prefill: null },
        { id: b, type: "TEXT", prefill: "DIETARY_RESTRICTIONS" },
        { id: c, type: "TEXT", prefill: null },
      ])
      expect(omitted.map((q) => q.prefill)).toEqual([
        "TELEGRAM",
        "DIETARY_RESTRICTIONS",
        "TELEGRAM",
      ])

      const cleared = await update([
        { id: a, type: "TEXT", prefill: "NONE" },
        { id: b, type: "TEXT", prefill: null },
        { id: c, type: "RADIO", prefill: null },
      ])
      expect(cleared.map((q) => q.prefill)).toEqual([
        null,
        "DIETARY_RESTRICTIONS",
        null,
      ])
    }))
})
