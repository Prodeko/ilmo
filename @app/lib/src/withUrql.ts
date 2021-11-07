import {
  AdminListEventsDocument,
  AdminListEventsQuery,
  Event,
  GraphCacheConfig,
} from "@app/graphql"
import hashes from "@app/graphql/client.json"
import minifiedSchema from "@app/graphql/introspection.min.json"
import { devtoolsExchange } from "@urql/devtools"
import { cacheExchange } from "@urql/exchange-graphcache"
import { multipartFetchExchange } from "@urql/exchange-multipart-fetch"
import { persistedFetchExchange } from "@urql/exchange-persisted-fetch"
import { IntrospectionQuery, OperationDefinitionNode } from "graphql"
import { Client, createClient } from "graphql-ws"
import { SSRExchange, withUrqlClient } from "next-urql"
import {
  dedupExchange,
  errorExchange,
  Exchange,
  subscriptionExchange,
} from "urql"

import { getSessionAndCSRFToken } from "."

const isDev = process.env.NODE_ENV === "development"
const isSSR = typeof window === "undefined"

let wsClient: Client | null = null
let rootURL: string | null = null

function createWsClient() {
  if (!rootURL) {
    throw new Error("No ROOT_URL")
  }
  let impl: typeof WebSocket
  if (isSSR) {
    const ws = require("ws")
    impl = ws
  } else {
    impl = WebSocket
  }
  const url = `${rootURL.replace(/^http/, "ws")}/graphql`
  return createClient({
    url,
    webSocketImpl: impl,
  })
}

export function resetWebsocketConnection(): void {
  if (wsClient) {
    wsClient.dispose()
  }
  wsClient = createWsClient()
}

export const withUrql = withUrqlClient(
  (ssrExchange: SSRExchange, ctx) => {
    const ROOT_URL = process.env.ROOT_URL
    if (!ROOT_URL) {
      throw new Error("ROOT_URL envvar is not set")
    }

    rootURL = ROOT_URL
    wsClient = createWsClient()

    return {
      url: `${rootURL}/graphql`,
      fetchOptions: () => {
        const [cookie, csrfToken] = getSessionAndCSRFToken(ctx)
        return {
          // fastify-csrf reads the CSRF-Token header
          // https://github.com/fastify/fastify-csrf#fastifycsrfprotectionrequest-reply-next
          headers: { "CSRF-Token": csrfToken, cookie },
          credentials: "same-origin",
        }
      },
      exchanges: [
        isDev && devtoolsExchange,
        dedupExchange,
        cacheExchange<GraphCacheConfig>({
          schema: minifiedSchema as unknown as IntrospectionQuery,
          keys: {
            // AppLanguage type does not have an 'id' field and thus cannot be
            // cached. Here we define a new key which will be used for caching
            // the AppLanguage type. There only exists one AppLanguage type
            // so we can just stringify the supportedLanguages field.
            AppLanguage: (data) => JSON.stringify(data.supportedLanguages),
          },
          updates: {
            Mutation: {
              logout(result, _args, cache, _info) {
                // Invalidate currentUser on logout. This refetches queries that
                // depend on the currentUser field.
                const { success } = result.logout || {}
                if (success) {
                  const key = "Query"
                  cache
                    .inspectFields(key)
                    .filter((field) => field.fieldName === "currentUser")
                    .forEach((field) => {
                      cache.invalidate(key, field.fieldKey)
                    })
                }
              },
              deleteEvent: (_result, { input: { id } }, cache, _info) => {
                const key = "Query"
                cache
                  .inspectFields(key)
                  .filter((field) => field.fieldName === "events")
                  .forEach((field) => {
                    cache.updateQuery<AdminListEventsQuery>(
                      {
                        query: AdminListEventsDocument,
                        variables: { ...field.arguments },
                      },
                      (data: any) => {
                        if (data) {
                          Object.keys(data).map((key) => {
                            if (data?.[key]?.nodes) {
                              data[key].nodes = data[key].nodes.filter(
                                (event: Event) => event.id !== id
                              )
                            }
                            if (data?.[key]?.totalCount) {
                              data[key].totalCount -= 1
                            }
                          })
                        }
                        return data
                      }
                    )
                  })
              },
              createEvent(_result, _args, cache, _info) {
                const key = "Query"
                cache
                  .inspectFields(key)
                  .filter((field) => field.fieldName === "events")
                  .forEach((field) => cache.invalidate(key, field.fieldKey))
              },
              updateEvent: (_result, _args, cache, _info) => {
                // We could define complex cache updating function
                // (such as the one for deleteEvent above) here to
                // prevent a network request after updating an event.
                // However, that would require keeping track of which
                // type of event (draft, signupUpcoming, signupOpen or
                // signupClosed) was updated and also track if its type
                // changed say from draft to signupUpcoming. We instead
                // invalidate all 'events' fields in the cache after a
                // single event is updated. This refetches the /admin/events/list
                // page's query in order to display up-to-date data on
                // that page.
                const key = "Query"
                cache
                  .inspectFields(key)
                  .filter(
                    (field) =>
                      field.fieldName === "events" ||
                      field.fieldName === "event"
                  )
                  .forEach((field) => cache.invalidate(key, field.fieldKey))
              },
              createEventCategory(_result, _args, cache, _info) {
                const key = "Query"
                cache
                  .inspectFields(key)
                  .filter((field) => field.fieldName === "eventCategories")
                  .forEach((field) => cache.invalidate(key, field.fieldKey))
              },
              deleteEventCategory(_result, args, cache, _info) {
                cache.invalidate({
                  __typename: "EventCategory",
                  id: args.input.id,
                })
              },
              adminDeleteRegistration(_result, args, cache, _info) {
                cache.invalidate({
                  __typename: "Registration",
                  id: args.input.id,
                })
              },
            },
          },
        }),
        ssrExchange,
        persistedFetchExchange({
          // Urql persisted queries support. We have pregenerated the query hashes
          // with 'graphql-codegen-persisted-query-ids' graphql-codegen plugin.
          // More information: https://formidable.com/open-source/urql/docs/advanced/persistence-and-uploads/#customizing-hashing
          generateHash: async (_, document) => {
            const operation = document.definitions[0] as OperationDefinitionNode
            const queryName = operation?.name?.value
            return queryName ? hashes[queryName] : ""
          },
        }),
        subscriptionExchange({
          forwardSubscription: (operation) => ({
            subscribe: (sink) => ({
              // TODO: remove ignore once urql types are updated
              // @ts-ignore
              unsubscribe: wsClient!.subscribe(operation, sink),
            }),
          }),
        }),
        errorExchange({
          onError(_error) {},
        }),
        multipartFetchExchange,
      ].filter(Boolean) as Exchange[],
    }
  },
  { ssr: false }
)
