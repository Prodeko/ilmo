import { GraphQLError } from "graphql"

import handleErrors from "../../src/utils/handleErrors"

const graphQLError = (originalError?: Error) =>
  new GraphQLError(
    originalError ? originalError.message : "Syntax Error",
    undefined,
    undefined,
    undefined,
    ["currentUser"],
    originalError
  )

const withCode = (message: string, code: string) =>
  Object.assign(new Error(message), { code })

describe("handleErrors", () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it.each([
    "timeout exceeded when trying to connect",
    "Connection terminated due to connection timeout",
  ])("logs an error without a code: %s", (message) => {
    const originalError = new Error(message)

    const [result] = handleErrors([graphQLError(originalError)])

    expect(result.message).toEqual(message)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), originalError)
  })

  it.each([
    ["a database error", withCode("duplicate key value", "23505")],
    ["an application error", withCode("Incorrect username/password", "CREDS")],
    [
      "a mutation that matched no row",
      new Error(
        "No values were deleted in collection 'events' because no values you can delete were found matching these criteria."
      ),
    ],
  ])("does not log %s", (_, originalError) => {
    handleErrors([graphQLError(originalError)])

    expect(consoleError).not.toHaveBeenCalled()
  })

  it("does not log an error from the GraphQL request itself", () => {
    handleErrors([graphQLError()])

    expect(consoleError).not.toHaveBeenCalled()
  })
})
