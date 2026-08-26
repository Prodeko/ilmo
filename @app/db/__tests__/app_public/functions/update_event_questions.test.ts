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
            row($2::uuid, 0::smallint, 'TEXT'::app_public.question_type, $3::app_public.translated_field, false, null),
            row(null, 1::smallint, 'TEXT'::app_public.question_type, $4::app_public.translated_field, false, null)
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
})
