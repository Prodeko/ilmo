import type { GraphQLError } from "graphql"
import type { CombinedError } from "urql"

export function extractError(error: null): null
export function extractError(error: Error): Error
export function extractError(error: CombinedError): GraphQLError
export function extractError(error: GraphQLError): GraphQLError
export function extractError(
  error: null | Error | CombinedError | GraphQLError
): null | Error | GraphQLError {
  return (
    (error &&
      "graphQLErrors" in error &&
      error.graphQLErrors &&
      error.graphQLErrors.length &&
      error.graphQLErrors[0]) ||
    error
  )
}

export function getExceptionFromError(
  error: null | Error | CombinedError | GraphQLError
): Error | null {
  // @ts-ignore
  const graphqlError = extractError(error)
  const exception = (graphqlError as GraphQLError)?.extensions?.exception
  return exception || graphqlError || error
}

export function getCodeFromError(
  error: null | Error | CombinedError | GraphQLError
): null | string {
  const err = getExceptionFromError(error)
  return (err && err["code"]) || null
}
