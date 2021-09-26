import {
  Event,
  GraphCacheConfig,
  ListEventsDocument,
  ListEventsQuery,
} from "@app/graphql"
import hashes from "@app/graphql/client.json"
import minifiedSchema from "@app/graphql/introspection.min.json"
import { devtoolsExchange } from "@urql/devtools"
import { cacheExchange } from "@urql/exchange-graphcache"
import { multipartFetchExchange } from "@urql/exchange-multipart-fetch"
import { persistedFetchExchange } from "@urql/exchange-persisted-fetch"
import { serialize } from "cookie"
import { IntrospectionQuery, OperationDefinitionNode } from "graphql"
import { Client, createClient } from "graphql-ws"
import { NextPageContext } from "next"
import { SSRExchange, withUrqlClient } from "next-urql"
import {
  dedupExchange,
  errorExchange,
  Exchange,
  subscriptionExchange,
} from "urql"

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

function getCSRFToken(ctx: NextPageContext | undefined) {
  let CSRF_TOKEN
  if (!isSSR) {
    // Read the CSRF_TOKEN from __NEXT_DATA__ on client side
    const nextDataEl = document.getElementById("__NEXT_DATA__")
    if (!nextDataEl) {
      throw new Error("Cannot read from __NEXT_DATA__ element")
    }
    const data = JSON.parse(nextDataEl.textContent || "{}")
    CSRF_TOKEN = data.query.CSRF_TOKEN
  } else {
    // Read the CSRF_TOKEN from the context on server side.
    // See @app/server/src/middleware/installSSR.ts for more information.
    CSRF_TOKEN = ctx?.query.CSRF_TOKEN
  }
  return CSRF_TOKEN
}

declare module "http" {
  interface IncomingMessage {
    cookies?: {
      session?: string
    }
  }
}

function getCookies(ctx: NextPageContext | undefined) {
  let COOKIES
  if (!isSSR) {
    COOKIES = document.cookie
  } else {
    const sessionCookie = ctx?.req?.cookies?.session
    // If the session cookie already exists during SSR, we serialize the
    // cookie and send it along with other HTTP headers. On the other hand,
    // if a session does not yet exist we read the session cookie from the
    // "set-cookie" header and send that as the session cookie during SSR.
    COOKIES = sessionCookie
      ? serialize("session", sessionCookie)
      : ctx?.res?.getHeaders()?.["set-cookie"]
  }
  return COOKIES as string
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
        const COOKIES = getCookies(ctx)
        const CSRF_TOKEN = getCSRFToken(ctx)
        return {
          headers: { "CSRF-Token": CSRF_TOKEN ?? "", cookie: COOKIES ?? "" },
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
                    cache.updateQuery<ListEventsQuery>(
                      {
                        query: ListEventsDocument,
                        variables: { ...field.arguments },
                      },
                      (data) => {
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
  { ssr: true }
)
