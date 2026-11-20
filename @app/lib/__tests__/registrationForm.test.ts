import { buildRegistrationInitialValues } from "../src/registrationForm"

const user = (name: string | null, primaryEmail: string | null = null) => ({
  name,
  primaryEmail,
})

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
})
