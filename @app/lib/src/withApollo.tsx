import {
  ApolloClient,
  ApolloLink,
  FetchResult,
  HttpLink,
  InMemoryCache,
  Observable,
  Operation,
  split,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { createPersistedQueryLink } from "@apollo/client/link/persisted-queries";
import { getDataFromTree } from "@apollo/client/react/ssr";
import hashes from "@app/graphql/client.json";
import { SentryLink } from "apollo-link-sentry";
import { createUploadLink } from "apollo-upload-client";
import { getOperationAST, GraphQLError, print } from "graphql";
import { usePregeneratedHashes } from "graphql-codegen-persisted-query-ids/lib/apollo";
import { Client, createClient } from "graphql-ws";
import withApolloBase from "next-with-apollo";

import { GraphileApolloLink } from "./GraphileApolloLink";

let wsClient: Client | null = null;

class WebSocketLink extends ApolloLink {
  public request(operation: Operation): Observable<FetchResult> {
    return new Observable((sink) => {
      if (!wsClient) {
        sink.error(new Error("No websocket connection"));
        return;
      }
      return wsClient.subscribe<FetchResult>(
        { ...operation, query: print(operation.query) },
        {
          next: sink.next.bind(sink),
          complete: sink.complete.bind(sink),
          error: (err) => {
            if (err instanceof Error) {
              sink.error(err);
            } else if (err instanceof CloseEvent) {
              sink.error(
                new Error(
                  `Socket closed with event ${err.code}` + err.reason
                    ? `: ${err.reason}` // reason will be available on clean closes
                    : ""
                )
              );
            } else {
              sink.error(
                new Error(
                  (err as GraphQLError[])
                    .map(({ message }) => message)
                    .join(", ")
                )
              );
            }
          },
        }
      );
    });
  }
}

let _rootURL: string | null = null;
function createWsClient() {
  if (!_rootURL) {
    throw new Error("No ROOT_URL");
  }
  const url = `${_rootURL.replace(/^http/, "ws")}/graphql`;
  return createClient({
    url,
  });
}

export function resetWebsocketConnection(): void {
  if (wsClient) {
    wsClient.dispose();
  }
  wsClient = createWsClient();
}

function makeServerSideLink(req: any, res: any) {
  return new GraphileApolloLink({
    req,
    res,
    postgraphileMiddleware: req.postgraphileMiddleware,
  });
}

function makeClientSideLink(ROOT_URL: string) {
  if (_rootURL) {
    throw new Error("Must only makeClientSideLink once");
  }
  _rootURL = ROOT_URL;

  const nextDataEl = document.getElementById("__NEXT_DATA__");
  if (!nextDataEl || !nextDataEl.textContent) {
    throw new Error("Cannot read from __NEXT_DATA__ element");
  }
  const data = JSON.parse(nextDataEl.textContent);
  const CSRF_TOKEN = data.query.CSRF_TOKEN;
  const httpLink = new HttpLink({
    uri: `${ROOT_URL}/graphql`,
    credentials: "same-origin",
    headers: {
      "CSRF-Token": CSRF_TOKEN,
    },
  });
  wsClient = createWsClient();
  const wsLink = new WebSocketLink();
  const uploadLink = createUploadLink({ uri: `${ROOT_URL}/graphql` });

  // Using the ability to split links, you can send data to each link
  // depending on what kind of operation is being sent.
  const testLink = split(
    // split based on operation type
    (operation) => operation.getContext().hasUpload,
    // @ts-ignore: TODO remove comment when typings have been updated
    uploadLink,
    httpLink
  );

  const mainLink = split(
    // split based on operation type
    ({ query, operationName }) => {
      const op = getOperationAST(query, operationName);
      return (op && op.operation === "subscription") || false;
    },
    wsLink,
    testLink
  );
  return mainLink;
}

export const withApollo = withApolloBase(
  ({ initialState, ctx }) => {
    const ROOT_URL = process.env.ROOT_URL;
    if (!ROOT_URL) {
      throw new Error("ROOT_URL envvar is not set");
    }

    const onErrorLink = onError(({ graphQLErrors, networkError }) => {
      if (graphQLErrors)
        graphQLErrors.map(({ message, locations, path }) =>
          console.error(
            `[GraphQL error]: message: ${message}, location: ${JSON.stringify(
              locations
            )}, path: ${JSON.stringify(path)}`
          )
        );
      if (networkError) console.error(`[Network error]: ${networkError}`);
    });

    const { req, res }: any = ctx || {};
    const isServer = typeof window === "undefined";
    const mainLink =
      isServer && req && res
        ? makeServerSideLink(req, res)
        : makeClientSideLink(ROOT_URL);

    const persistedLink = createPersistedQueryLink({
      useGETForHashedQueries: false,
      generateHash: usePregeneratedHashes(hashes),
      disable: () => false,
    });

    const sentryLink = new SentryLink({
      attachBreadcrumbs: {
        includeQuery: true,
        includeVariables: true,
        includeFetchResult: true,
        includeError: true,
        includeCache: true,
      },
    });

    const client = new ApolloClient({
      ssrMode: isServer,
      link: ApolloLink.from([onErrorLink, sentryLink, persistedLink, mainLink]),
      cache: new InMemoryCache({}).restore(initialState || {}),
    });

    return client;
  },
  {
    getDataFromTree,
  }
);
