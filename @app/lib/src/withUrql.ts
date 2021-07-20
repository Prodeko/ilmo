import {
  EventPageDocument,
  EventPageQuery,
  GraphCacheConfig,
} from "@app/graphql"
import hashes from "@app/graphql/client.json"
import { dedupExchange, fetchExchange, subscriptionExchange } from "@urql/core"
import { devtoolsExchange } from "@urql/devtools"
import { cacheExchange } from "@urql/exchange-graphcache"
import { multipartFetchExchange } from "@urql/exchange-multipart-fetch"
import { persistedFetchExchange } from "@urql/exchange-persisted-fetch"
import { serialize } from "cookie"
import { OperationDefinitionNode } from "graphql"
import { Client, createClient } from "graphql-ws"
import { NextUrqlContext, SSRExchange, withUrqlClient } from "next-urql"
import { errorExchange, Exchange } from "urql"
import ws from "ws"

const isDev = process.env.NODE_ENV === "development"
const isSSR = typeof window === "undefined"

let wsClient: Client | null = null
let rootURL: string | null = null

function createWsClient() {
  if (!rootURL) {
    throw new Error("No ROOT_URL")
  }
  const impl = isSSR ? ws : WebSocket
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

function getCSRFToken(ctx: NextUrqlContext | undefined) {
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

function getCookies(ctx: NextUrqlContext | undefined) {
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
      : ctx?.res.getHeaders()?.["set-cookie"]
  }
  return COOKIES
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
          headers: { "CSRF-Token": CSRF_TOKEN, cookie: COOKIES },
        }
      },
      exchanges: [
        isDev && devtoolsExchange,
        dedupExchange,
        cacheExchange<GraphCacheConfig>({
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
              createRegistration(result, _args, cache, _info) {
                // Update EventPageQuery results in the cache after createRegistration
                // mutation so that eventPage shows the correct registrations without a
                // doing a new HTTP request
                const { registration } = result.createRegistration || {}
                cache.updateQuery<EventPageQuery>(
                  {
                    query: EventPageDocument,
                    variables: { slug: registration?.event?.slug! },
                  },
                  (data) => {
                    if (registration) {
                      data?.eventBySlug?.registrations?.nodes?.push(
                        registration
                      )
                      return data
                    }
                    return null
                  }
                )
              },
            },
          },
        }),
        ssrExchange,
        persistedFetchExchange({
          // Urql persisted queries support. We have pregenerated the  query hashes
          // with 'graphql-codegen-persisted-query-ids' graphql-codegen plugin.
          // More information: https://formidable.com/open-source/urql/docs/advanced/persistence-and-uploads/#customizing-hashing
          generateHash: async (_, document) => {
            const operation = document.definitions[0] as OperationDefinitionNode
            const queryName = operation?.name?.value
            return queryName ? hashes[queryName] : ""
          },
        }),
        multipartFetchExchange,
        subscriptionExchange({
          forwardSubscription(operation) {
            return {
              subscribe: (sink) => {
                const dispose = wsClient!.subscribe(operation, sink)
                return {
                  unsubscribe: dispose,
                }
              },
            }
          },
        }),
        errorExchange({
          onError(_error) {},
        }),
        fetchExchange,
      ].filter(Boolean) as Exchange[],
    }
  },
  { ssr: true }
)
