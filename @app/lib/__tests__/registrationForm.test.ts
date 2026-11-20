import {
  buildRegistrationInitialValues,
  buildRegistrationProfileUpdate,
  hasPrefillQuestions,
} from "../src/registrationForm"

const user = (name: string | null, primaryEmail: string | null = null) => ({
  name,
  primaryEmail,
})

const keycloakUser = (
  name: string | null,
  firstName: string | null,
  lastName: string | null
) => ({ name, primaryEmail: "anna@example.com", firstName, lastName })

describe("buildRegistrationInitialValues", () => {
  it("returns empty values when nobody is signed in", () => {
    expect(buildRegistrationInitialValues({ currentUser: null })).toStrictEqual(
      { firstName: undefined, lastName: undefined, email: undefined }
    )
    expect(
      buildRegistrationInitialValues({ currentUser: undefined })
    ).toStrictEqual({
      firstName: undefined,
      lastName: undefined,
      email: undefined,
    })
  })

  it("prefills the email from the primary email", () => {
    expect(
      buildRegistrationInitialValues({
        currentUser: user("Teemu Teekkari", "teemu@example.com"),
      })
    ).toStrictEqual({
      firstName: "Teemu",
      lastName: "Teekkari",
      email: "teemu@example.com",
    })
  })

  it("keeps a missing primary email as null", () => {
    expect(
      buildRegistrationInitialValues({ currentUser: user("Teemu Teekkari") })
    ).toStrictEqual({
      firstName: "Teemu",
      lastName: "Teekkari",
      email: null,
    })
  })

  it("leaves the names empty when the user has no name", () => {
    for (const name of [null, ""]) {
      expect(
        buildRegistrationInitialValues({
          currentUser: user(name, "a@example.com"),
        })
      ).toStrictEqual({
        firstName: undefined,
        lastName: undefined,
        email: "a@example.com",
      })
    }
  })

  it("uses a one-word name as the first name only", () => {
    expect(
      buildRegistrationInitialValues({ currentUser: user("Teemu") })
    ).toMatchObject({ firstName: "Teemu", lastName: undefined })
  })

  it("takes the first two words of a longer name", () => {
    expect(
      buildRegistrationInitialValues({
        currentUser: user("Anna Maria von Wright"),
      })
    ).toMatchObject({ firstName: "Anna", lastName: "Maria" })
  })

  it("splits on single spaces without trimming", () => {
    expect(
      buildRegistrationInitialValues({ currentUser: user(" Teemu Teekkari") })
    ).toMatchObject({ firstName: "", lastName: "Teemu" })
    expect(
      buildRegistrationInitialValues({ currentUser: user("Teemu  Teekkari") })
    ).toMatchObject({ firstName: "Teemu", lastName: "" })
    expect(
      buildRegistrationInitialValues({ currentUser: user("Teemu\tTeekkari") })
    ).toMatchObject({ firstName: "Teemu\tTeekkari", lastName: undefined })
  })

  it("does not prefill answers from the questions", () => {
    expect(
      buildRegistrationInitialValues({
        currentUser: user("Teemu Teekkari", "teemu@example.com"),
        questions: [{ id: "q1" }, { id: "q2" }],
      })
    ).toStrictEqual({
      firstName: "Teemu",
      lastName: "Teekkari",
      email: "teemu@example.com",
    })
  })

  it("ignores the Keycloak names while keycloak_names is off", () => {
    for (const features of [
      undefined,
      {},
      { keycloak_names: false },
    ] as const) {
      expect(
        buildRegistrationInitialValues({
          currentUser: keycloakUser(
            "Anna Maria von Wright",
            "Anna Maria",
            "von Wright"
          ),
          features,
        })
      ).toStrictEqual({
        firstName: "Anna",
        lastName: "Maria",
        email: "anna@example.com",
      })
    }
  })

  describe("with keycloak_names on", () => {
    const features = { keycloak_names: true }

    it("returns empty values when nobody is signed in", () => {
      expect(
        buildRegistrationInitialValues({ currentUser: null, features })
      ).toStrictEqual({
        firstName: undefined,
        lastName: undefined,
        email: undefined,
      })
    })

    it("prefers the Keycloak first and last name", () => {
      expect(
        buildRegistrationInitialValues({
          currentUser: keycloakUser(
            "Anna Maria von Wright",
            "Anna Maria",
            "von Wright"
          ),
          features,
        })
      ).toStrictEqual({
        firstName: "Anna Maria",
        lastName: "von Wright",
        email: "anna@example.com",
      })
    })

    it("uses the display name unless both Keycloak names are known", () => {
      for (const [firstName, lastName] of [
        [null, null],
        ["Anna", null],
        [null, "Wright"],
        ["", "Wright"],
      ]) {
        expect(
          buildRegistrationInitialValues({
            currentUser: keycloakUser("Teemu Teekkari", firstName, lastName),
            features,
          })
        ).toMatchObject({ firstName: "Teemu", lastName: "Teekkari" })
      }
    })

    it("uses a display name of at most two words", () => {
      expect(
        buildRegistrationInitialValues({
          currentUser: user("Teemu Teekkari", "teemu@example.com"),
          features,
        })
      ).toStrictEqual({
        firstName: "Teemu",
        lastName: "Teekkari",
        email: "teemu@example.com",
      })
      expect(
        buildRegistrationInitialValues({ currentUser: user("Teemu"), features })
      ).toMatchObject({ firstName: "Teemu", lastName: undefined })
    })

    it("leaves the names empty for a display name of three or more words", () => {
      expect(
        buildRegistrationInitialValues({
          currentUser: user("Anna Maria von Wright", "anna@example.com"),
          features,
        })
      ).toStrictEqual({
        firstName: undefined,
        lastName: undefined,
        email: "anna@example.com",
      })
      expect(
        buildRegistrationInitialValues({
          currentUser: user("Anna Maria Wright"),
          features,
        })
      ).toMatchObject({ firstName: undefined, lastName: undefined })
    })

    it("trims the display name and splits it on any whitespace", () => {
      expect(
        buildRegistrationInitialValues({
          currentUser: user("  Teemu   Teekkari "),
          features,
        })
      ).toMatchObject({ firstName: "Teemu", lastName: "Teekkari" })
      expect(
        buildRegistrationInitialValues({
          currentUser: user("Teemu\tTeekkari"),
          features,
        })
      ).toMatchObject({ firstName: "Teemu", lastName: "Teekkari" })
      expect(
        buildRegistrationInitialValues({
          currentUser: user(" Anna  Maria\nWright "),
          features,
        })
      ).toMatchObject({ firstName: undefined, lastName: undefined })
    })

    it("leaves the names empty for a blank display name", () => {
      for (const name of [null, "", "   "]) {
        expect(
          buildRegistrationInitialValues({ currentUser: user(name), features })
        ).toMatchObject({ firstName: undefined, lastName: undefined })
      }
    })
  })
})

const profileUser = {
  name: "Teemu Teekkari",
  primaryEmail: "teemu@example.com",
  registrationProfile: { telegram: "@teemu", dietaryRestrictions: "Vegan" },
}

const prefillQuestions = [
  { id: "q-telegram", prefill: "TELEGRAM" },
  { id: "q-plain", prefill: null },
  { id: "q-diet", prefill: "DIETARY_RESTRICTIONS" },
]

describe("buildRegistrationInitialValues answer prefill", () => {
  it("does not prefill answers while prefill_answers is off", () => {
    for (const features of [
      undefined,
      {},
      { prefill_answers: false },
    ] as const) {
      expect(
        buildRegistrationInitialValues({
          currentUser: profileUser,
          questions: prefillQuestions,
          features,
        })
      ).toStrictEqual({
        firstName: "Teemu",
        lastName: "Teekkari",
        email: "teemu@example.com",
      })
    }
  })

  describe("with prefill_answers on", () => {
    const features = { prefill_answers: true }

    it("prefills the questions marked for prefill from the profile", () => {
      expect(
        buildRegistrationInitialValues({
          currentUser: profileUser,
          questions: prefillQuestions,
          features,
        })
      ).toStrictEqual({
        firstName: "Teemu",
        lastName: "Teekkari",
        email: "teemu@example.com",
        answers: { "q-telegram": "@teemu", "q-diet": "Vegan" },
      })
    })

    it("leaves out fields the profile does not have", () => {
      expect(
        buildRegistrationInitialValues({
          currentUser: {
            ...profileUser,
            registrationProfile: { telegram: null, dietaryRestrictions: "" },
          },
          questions: prefillQuestions,
          features,
        })
      ).not.toHaveProperty("answers")
      expect(
        buildRegistrationInitialValues({
          currentUser: {
            ...profileUser,
            registrationProfile: { telegram: "@teemu" },
          },
          questions: prefillQuestions,
          features,
        }).answers
      ).toStrictEqual({ "q-telegram": "@teemu" })
    })

    it("prefills nothing without a profile or a signed-in user", () => {
      for (const currentUser of [
        null,
        { ...profileUser, registrationProfile: null },
      ]) {
        expect(
          buildRegistrationInitialValues({
            currentUser,
            questions: prefillQuestions,
            features,
          })
        ).not.toHaveProperty("answers")
      }
    })

    it("ignores unknown prefill values", () => {
      expect(
        buildRegistrationInitialValues({
          currentUser: profileUser,
          questions: [{ id: "q1", prefill: "SHOE_SIZE" }],
          features,
        })
      ).not.toHaveProperty("answers")
    })
  })
})

describe("hasPrefillQuestions", () => {
  it("is true only when a question is marked for prefill", () => {
    expect(hasPrefillQuestions(prefillQuestions)).toBe(true)
    expect(hasPrefillQuestions([{ id: "q1", prefill: null }])).toBe(false)
    expect(hasPrefillQuestions([{ id: "q1" }])).toBe(false)
    expect(hasPrefillQuestions(null)).toBe(false)
  })
})

describe("buildRegistrationProfileUpdate", () => {
  it("returns the trimmed answers of the prefill questions", () => {
    expect(
      buildRegistrationProfileUpdate(prefillQuestions, {
        "q-telegram": " @teemu ",
        "q-plain": "something else",
        "q-diet": "Vegan",
      })
    ).toStrictEqual({ telegram: "@teemu", dietaryRestrictions: "Vegan" })
  })

  it("keeps fields the event does not ask for as null", () => {
    expect(
      buildRegistrationProfileUpdate(
        [{ id: "q-telegram", prefill: "TELEGRAM" }],
        {
          "q-telegram": "@teemu",
        }
      )
    ).toStrictEqual({ telegram: "@teemu", dietaryRestrictions: null })
  })

  it("clears a field whose answer was left empty", () => {
    expect(
      buildRegistrationProfileUpdate(prefillQuestions, { "q-diet": "Vegan" })
    ).toStrictEqual({ telegram: "", dietaryRestrictions: "Vegan" })
  })

  it("leaves out an over-length answer", () => {
    expect(
      buildRegistrationProfileUpdate(prefillQuestions, {
        "q-telegram": "@" + "a".repeat(64),
        "q-diet": "d".repeat(1000),
      })
    ).toStrictEqual({ telegram: null, dietaryRestrictions: "d".repeat(1000) })
    expect(
      buildRegistrationProfileUpdate(
        [{ id: "q-telegram", prefill: "TELEGRAM" }],
        { "q-telegram": "@" + "a".repeat(64) }
      )
    ).toBeNull()
  })

  it("returns null when no question is marked for prefill", () => {
    expect(
      buildRegistrationProfileUpdate([{ id: "q-plain" }], { "q-plain": "x" })
    ).toBeNull()
    expect(buildRegistrationProfileUpdate(undefined, undefined)).toBeNull()
  })
})
