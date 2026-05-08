const { builtinModules } = require("module")

const js = require("@eslint/js")
// @graphql-eslint/eslint-plugin is intentionally absent: v4 requires graphql>=16
// but pnpm.overrides forces graphql to 15.x for PostGraphile v4. Re-add when
// the deferred PostGraphile v5 ADR lifts the graphql pin.
const tsParser = require("@typescript-eslint/parser")
const tsPlugin = require("@typescript-eslint/eslint-plugin")
const cypressPlugin = require("eslint-plugin-cypress/flat")
const prettierConfig = require("eslint-config-prettier")
const importPlugin = require("eslint-plugin-import")
const jestPlugin = require("eslint-plugin-jest")
const jsxA11yPlugin = require("eslint-plugin-jsx-a11y")
const prettierPlugin = require("eslint-plugin-prettier")
const reactPlugin = require("eslint-plugin-react")
const reactHooksPlugin = require("eslint-plugin-react-hooks")
const simpleImportSort = require("eslint-plugin-simple-import-sort")
const globals = require("globals")

const importSortGroups = [
  [`^(${builtinModules.join("|")})(/|$)`],
  ["^react", "^@?\\w"],
  ["^\\u0000"],
  ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
  ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
  ["^.+\\.s?css$"],
  ["^.+\u0000$"],
]

const sharedRules = {
  "react/display-name": "off",
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      args: "after-used",
      ignoreRestSiblings: true,
      caughtErrors: "none",
    },
  ],
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      args: "after-used",
      ignoreRestSiblings: true,
      caughtErrors: "none",
    },
  ],
  // Empty catch blocks are an intentional pattern in this codebase
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-unused-expressions": ["error", { allowTernary: true }],
  "no-console": "off",
  "no-confusing-arrow": "off",
  "no-else-return": "off",
  "no-return-assign": ["error", "except-parens"],
  "no-underscore-dangle": "off",
  "jest/no-focused-tests": "error",
  "jest/no-identical-title": "error",
  camelcase: "off",
  "prefer-arrow-callback": ["error", { allowNamedFunctions: true }],
  "class-methods-use-this": "off",
  "no-restricted-syntax": "off",
  "no-param-reassign": ["error", { props: false }],
  "react/prop-types": "off",
  "react/no-multi-comp": "off",
  // Next.js automatically imports React
  "react/react-in-jsx-scope": "off",
  "react/jsx-filename-extension": ["warn", { extensions: [".ts", ".tsx"] }],
  "react/no-unescaped-entities": "off",
  "import/no-extraneous-dependencies": "off",
  "react/destructuring-assignment": "off",
  "arrow-body-style": "off",
  "no-nested-ternary": "off",
  "react/jsx-sort-props": [
    "warn",
    { callbacksLast: true, shorthandLast: true, reservedFirst: true },
  ],
  "simple-import-sort/imports": ["error", { groups: importSortGroups }],
  "simple-import-sort/exports": "error",
  "sort-imports": "off",
  "import/first": "error",
  "import/newline-after-import": "error",
  "import/no-duplicates": "error",
  "import/no-deprecated": "warn",
  // TypeScript's own type-checker is the source of truth for default-export
  // shape; eslint-plugin-import gets CJS interop wrong on packages like
  // next-translate v1 and many *.mjs entry points.
  "import/default": "off",
  "import/no-named-as-default-member": "off",
}

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "data/schema.graphql",
      "data/schema.sql",
      "@app/graphql/index.*",
      "@app/graphql/.persisted_operations/**",
      "@app/client/.next/**",
    ],
  },
  js.configs.recommended,
  {
    files: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
      "**/*.jsx",
      "**/*.mjs",
      "**/*.cjs",
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.es2022,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      jest: jestPlugin,
      "jsx-a11y": jsxA11yPlugin,
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
      prettier: prettierPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      ...prettierConfig.rules,
      ...sharedRules,
    },
  },
  {
    // TypeScript handles these checks better than ESLint's base rules
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-redeclare": "off",
      "no-dupe-class-members": "off",
    },
  },
  {
    // tsc and Node resolve path aliases via tsconfig and pnpm; eslint-plugin-import
    // can't see those without a heavy resolver, so disable the redundant check.
    files: ["**/*.{ts,tsx,mjs,cjs,js,jsx}"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
  {
    files: ["@app/e2e/cypress/**"],
    ...cypressPlugin.configs.recommended,
    rules: {
      ...cypressPlugin.configs.recommended.rules,
      // Tests intentionally chain commands and use waits in the unflakied specs
      "cypress/unsafe-to-chain-command": "off",
      "cypress/no-unnecessary-waiting": "off",
    },
  },
]
