# @app/client

This is the React frontend of our application, built with
[Next.js](https://nextjs.org/). Next.js uses the
[file-system as the main API](https://nextjs.org/docs#manual-setup) ─ files
inside the [src/pages](./src/pages) folder automatically turn into routes of the
same name, for example the route `/login` is provided by
[src/pages/login.tsx](src/pages/login.tsx).

## GraphQL files

We've separated the GraphQL queries, mutations, subscriptions and fragments into
`.graphql` files inside the `src/graphql` folder. These are scanned and code
generated by [@app/graphql](../graphql/README.md), so that we can then import
them by name, for example:

```ts
import { useAddEmailMutation } from "@app/graphql"
```

`graphql-code-generator`, used in `@app/graphql`, automatically builds hooks
like `use*Query`, `use*Mutation` and `use*Query` so we do not include `Query`,
`Mutation` or `Subscription` in our operation names.

### GraphQL naming conventions

1. Operations are named in PascalCase
2. Name the file after the operation or fragment (e.g.
   `fragment EmailsForm_User {...}` would be in a file called
   `EmailsForm_User.graphql`)
3. Do not add `Query`, `Mutation` or `Subscription` suffixes to operations
4. Do not add `Fragment` suffix to fragments
5. Operations (i.e. non-fragments) should never contain an underscore in their
   name - underscores are reserved for fragments.
6. Fragments should always contain exactly one underscore, see fragment naming
   below

### GraphQL fragment naming

Fragments belong to components (or functions) to enable GraphQL composition.
This is one of the most powerful and most important features about doing GraphQL
right - it helps to ensure that you only ask the server for data you actually
need (and allows composing these data requirements between multiple components
for greater efficiency).

Fragments are named according to the following pattern:

```
[ComponentName]_[Distinguisher?][Type]
```

1. `ComponentName` - the name of the React component (or possibly function) that
   owns this fragment.
2. `_` - an underscore
3. `Distinguisher?` - an optional piece of text if this component includes
   multiple fragments that are valid on the same `Type`
4. `Type` - the GraphQL type name upon which this fragment is valid.

For example:

```graphql
fragment EmailsForm_User on User {
  ...
}
```
