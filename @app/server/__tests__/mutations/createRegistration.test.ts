import { CreateEventRegistrationDocument, QuestionType } from "@app/graphql"

import {
  asRoot,
  assertJobComplete,
  claimRegistrationToken,
  constructAnswersFromQuestions,
  createEventDataAndLogin,
  deleteTestData,
  getJobs,
  removePropFromObject,
  runGraphQLQuery,
  runJobs,
  setup,
  teardown,
} from "../helpers"

beforeEach(deleteTestData)
beforeAll(setup)
afterAll(teardown)

describe("CreateRegistration", () => {
  // A bit of background about the overall event registration setup. In order
  // to register to an event the user first has to call a claimRegistrationToken
  // mutation. This mutation provides the user with a registration token that
  // must be passed to the createRegistration mutation. A row is inserted into
  // app_public.registrations already when calling claimRegistrationToken. This
  // same row (identified by registration_token) is then updated with user info
  // when the user calls the createRegistration mutation. We also have a server
  // plugin called EventRegistrationPlugin that wraps the createRegistration
  // mutation. This plugin is reponsible for dispatching a graphile-worker event
  // that deletes the rate limit key from redis after successful registration.
  //
  // This setup is designed to prevent people from claiming registration
  // tokens by calling the API and then distributing the tokens to their friends.
  // By rate limiting the claimRegistrationToken endpoint we prevent this. After
  // the registration is complete the rate limit key should be removed from redis.
  // This enables multiple people to use the same computer for registering to an
  // event.

  it("can create registration", async () => {
    const { events, quotas, questions } = await createEventDataAndLogin({
      registrationOptions: { create: false },
      questionOptions: { create: true, amount: 3, required: true },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id
    const answers = constructAnswersFromQuestions(questions)

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          registrationToken,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
          answers,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json, { pgClient, redisClient, req }) => {
        expect(json.errors).toBeFalsy()
        expect(json.data).toBeTruthy()

        const registration = json.data!.createRegistration.registration

        expect(registration).toBeTruthy()
        expect(registration.event.id).toEqual(eventId)
        expect(registration.quota.id).toEqual(quotaId)

        // Registration should exist in the database
        const { rows: registrations } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_public.registrations WHERE id = $1`,
            [registration.id]
          )
        )
        if (registrations.length !== 1) {
          throw new Error("Registration not found!")
        }
        expect(registrations[0].id).toEqual(registration.id)

        // Registration secrets table should be updated with the registration_id
        const { rows: registrationSecrets } = await asRoot(pgClient, () =>
          pgClient.query(
            `SELECT * FROM app_private.registration_secrets WHERE registration_id = $1`,
            [registration.id]
          )
        )

        if (registrationSecrets.length !== 1) {
          throw new Error("Registration secret not found!")
        }
        expect(registrationSecrets[0].registration_id).toEqual(registration.id)
        expect(registrationSecrets[0].registration_token).toEqual(null)

        const rateLimitjobs = await getJobs(
          pgClient,
          "registration__delete_rate_limit_key"
        )

        expect(rateLimitjobs).toHaveLength(1)
        const [rateLimitJob] = rateLimitjobs
        expect(rateLimitJob.payload).toMatchObject({
          eventId: eventId,
          ipAddress: req.ip,
        })

        const confirmationEmailJobs = await getJobs(
          pgClient,
          "registration__send_confirmation_email"
        )

        expect(confirmationEmailJobs).toHaveLength(1)
        const [confirmationEmailJob] = confirmationEmailJobs
        expect(confirmationEmailJob.payload).toMatchObject({
          id: registration.id,
        })

        // Escape transaction set by runGraphQLQuery.
        //
        // When inside a transaction, SQL date functions return values based on
        // the __start time of the current transaction__. This is a problem since
        // graphile-worker only executes a task if its run_at property is less than
        // select now(). Our helper function runGraphQLQuery sets up a transaction by calling
        // withPostGraphileContext. Next we run the createRegistration mutation that
        // we are testing. The mutation goes through EventRegistrationPlugin which schedules
        // a task called `registration__delete_rate_limit_key`. Next we call
        // `runJobs` that executes a graphile-worker function called `runTaskListOnce`.
        // This function calls a graphile-worker database function graphile_worker.get_job
        // which only returns a task to run if run_at <= now(). As explained earlier, we are
        // inside a transaction and calls to now() return the timestamp of when the
        // transaction was created (which is before the mutation is run). Thus
        // run_at >= now() and the task is not executed if we don't end the transaction here.
        await pgClient.query("commit")

        // Run the jobs and assert that the jobs run correctly
        await runJobs(pgClient)
        await assertJobComplete(pgClient, rateLimitJob)
        await assertJobComplete(pgClient, confirmationEmailJob)

        // Redis should not contain a rate limiting key after
        // successful registration
        const rateLimitId = `${eventId}:${quotaId}`
        const key = `rate-limit:claimRegistrationToken:${rateLimitId}:127.1.1.1`
        const value = await redisClient.get(key)
        expect(value).toEqual(null)
        // TODO: Figure out a way to test gdpr__delete_event_registrations
        // graphile worker cron task.
      }
    )
  })

  it("can't create registration if registration token is not valid", async () => {
    const { events, quotas } = await createEventDataAndLogin({
      registrationOptions: { create: false },
      questionOptions: { create: false },
    })
    const event = events[0]
    const quota = quotas[0]

    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId: event.id,
          quotaId: quota.id,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
          // Invalid token
          registrationToken: "540f7d0f-7433-4657-bd98-3b405f913a15",
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual(
          "Registration token was not valid. Please reload the page."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("can't create registration if quotaId is invalid", async () => {
    const { events, quotas } = await createEventDataAndLogin({
      questionOptions: { create: false },
      registrationOptions: { create: false },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId: "d24a4112-81e2-440a-a9fa-be2371944310",
          registrationToken,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual("Quota not found.")
        expect(code).toEqual("NTFND")
      }
    )
  })

  it("can't create registration if eventId is invalid", async () => {
    const { events, quotas } = await createEventDataAndLogin({
      questionOptions: { create: false },
      registrationOptions: { create: false },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId: "d24a4112-81e2-440a-a9fa-be2371944310",
          quotaId,
          registrationToken,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual("Event not found.")
        expect(code).toEqual("NTFND")
      }
    )
  })

  it("can't create registration if registration is not open", async () => {
    const { quotas, events } = await createEventDataAndLogin({
      questionOptions: { create: false },
      registrationOptions: { create: false },
      eventOptions: { create: true, amount: 1, signupOpen: false },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id

    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          // Don't need to provide a proper registration token here, since the
          // check for event being open happens before token validation
          registrationToken: "dummy",
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual("Event registration is not open.")
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("can't create registration if registration token is for another event", async () => {
    const { events, quotas } = await createEventDataAndLogin({
      questionOptions: { create: false },
      registrationOptions: { create: false },
      eventOptions: { create: true, amount: 2, signupOpen: true },
    })
    const { registrationToken } = await claimRegistrationToken(
      events[0].id,
      quotas[0].id
    )

    // RegistrationSecret is claimed for event[0], try to use it to
    // register to another event which is not allowed
    const quotaId = quotas[0].id
    const eventId = events[1].id

    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          // Registration token is not valid for this event
          eventId,
          quotaId,
          registrationToken,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual(
          "Registration token was not valid. Please reload the page."
        )
        expect(code).toEqual("DNIED")
      }
    )
  })

  it("can't create a registration if first or last name contains spaces", async () => {
    const { quotas, events } = await createEventDataAndLogin({
      questionOptions: { create: false },
      registrationOptions: { create: false },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    // Test first name
    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          registrationToken,
          firstName: " ",
          lastName: "Testlastname",
          email: "testuser@example.com",
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual(
          'value for domain app_public.constrained_name violates check constraint "constrained_name_check"'
        )
        expect(code).toEqual("23514")
      }
    )

    // Test last name
    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          registrationToken,
          firstName: "Testname",
          lastName: "Last name",
          email: "testuser@example.com",
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual(
          'value for domain app_public.constrained_name violates check constraint "constrained_name_check"'
        )
        expect(code).toEqual("23514")
      }
    )
  })

  it("can't create a registration if a registration already exists with the same email", async () => {
    const { quotas, events, registrations } = await createEventDataAndLogin({
      questionOptions: { create: false },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id
    const email = registrations[0].email

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    // Test first name
    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          registrationToken,
          firstName: "Test",
          lastName: "Tester",
          email,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual(
          `A registration with email ${email} already exists for this event.`
        )
        expect(code).toEqual("DNIED")
      },
      // rollback
      true,
      // takeSnapshot
      // Don't take a snapshot of the result since the email in the error message changes
      false
    )
  })

  it("can't create registration if required question is not answered", async () => {
    const { quotas, questions, events } = await createEventDataAndLogin({
      registrationOptions: { create: false },
      questionOptions: { create: true, amount: 3, required: true },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    const answers = constructAnswersFromQuestions(questions)

    // Remove one required answer
    const someKey = Object.keys(answers)[0]
    const missingAnswers = removePropFromObject(answers, someKey)

    // Test missing answer to a required question
    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          registrationToken,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
          answers: missingAnswers,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual("Required question not answered.")
        expect(code).toEqual("NVLID")
      }
    )
  })

  it("can't create registration if more than one answer provided to a question type RADIO", async () => {
    const { quotas, questions, events } = await createEventDataAndLogin({
      registrationOptions: { create: false },
      questionOptions: { create: true, amount: 3, required: true },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    const radioId = questions.find((q) => q.type === QuestionType.Radio)?.id
    const answers = constructAnswersFromQuestions(questions)
    const answersInvalidRadio = {
      ...answers,
      // Answer for a RADIO question should not be an array
      [radioId]: [{ ...answers[radioId] }, { fi: "Väärin", en: "Invalid" }],
    }

    // Test missing answer to a required question
    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          registrationToken,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
          answers: answersInvalidRadio,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual(
          "Invalid answer data to question of type: RADIO."
        )
        expect(code).toEqual("NVLID")
      }
    )
  })

  it("can't create registration if invalid answer id provided", async () => {
    const { quotas, questions, events } = await createEventDataAndLogin({
      registrationOptions: { create: false },
      questionOptions: { create: true, amount: 3, required: true },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    const answers = constructAnswersFromQuestions(questions)
    const answersInvalid = {
      ...answers,
      // Invalid answer id
      "3582a656-80a3-45af-a58a-ba2ae8d7ddb2": ["Vastaus"],
    }

    // Test missing answer to a required question
    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          registrationToken,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
          answers: answersInvalid,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual("Invalid answer, related question not found.")
        expect(code).toEqual("NVLID")
      }
    )
  })

  it("can't create registration if answer is to a question which is not related to this event", async () => {
    const { quotas, questions, events } = await createEventDataAndLogin({
      registrationOptions: { create: false },
      questionOptions: { create: true, amount: 3, required: true },
    })
    const eventId = events[0].id
    const quotaId = quotas[0].id

    const { questions: otherQuestions } = await createEventDataAndLogin({
      registrationOptions: { create: false },
    })

    const { registrationToken } = await claimRegistrationToken(eventId, quotaId)

    // Answers are for another event. We must include the correct answers also.
    const correctAnswers = constructAnswersFromQuestions(questions)
    const wrongAnswers = constructAnswersFromQuestions(otherQuestions)
    const answers = { ...wrongAnswers, ...correctAnswers }

    // Test missing answer to a required question
    await runGraphQLQuery(
      CreateEventRegistrationDocument,

      // GraphQL variables:
      {
        input: {
          eventId,
          quotaId,
          registrationToken,
          firstName: "Testname",
          lastName: "Testlastname",
          email: "testuser@example.com",
          answers,
        },
      },

      // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
      {},

      // This function runs all your test assertions:
      async (json) => {
        expect(json.errors).toBeTruthy()

        const message = json.errors![0].message
        const code = json.errors![0].extensions.exception.code
        expect(message).toEqual(
          "Invalid answer, question is for another event."
        )
        expect(code).toEqual("NVLID")
      }
    )
  })

  const possibleMissingData = [
    ["null", null],
    ["[]", []],
    ["[null]", [null]],
    ["[null, null]", [null, null]],
  ]
  for (const type in QuestionType) {
    const upper = type.toUpperCase()
    for (const [repr, data] of possibleMissingData) {
      it(`can't create registration if type is: ${upper} and data is: ${repr}`, async () => {
        const { quotas, questions, events } = await createEventDataAndLogin({
          registrationOptions: { create: false },
          questionOptions: {
            create: true,
            amount: 1,
            required: true,
            type: upper as QuestionType,
          },
        })
        const eventId = events[0].id
        const quotaId = quotas[0].id
        const questionId = questions[0].id

        const { registrationToken } = await claimRegistrationToken(
          eventId,
          quotaId
        )
        const answers = { [questionId]: data }

        // Test missing answer to a required question
        await runGraphQLQuery(
          CreateEventRegistrationDocument,

          // GraphQL variables:
          {
            input: {
              eventId,
              quotaId,
              registrationToken,
              firstName: "Testname",
              lastName: "Testlastname",
              email: "testuser@example.com",
              answers,
            },
          },

          // Additional props to add to `req` (e.g. `user: {sessionId: '...'}`)
          {},

          // This function runs all your test assertions:
          async (json) => {
            expect(json.errors).toBeTruthy()

            const message = json.errors![0].message
            const code = json.errors![0].extensions.exception.code

            expect(message).toEqual(
              `Invalid answer data to question of type: ${upper}.`
            )
            expect(code).toEqual("NVLID")
          }
        )
      })
    }
  }
})
