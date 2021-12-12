module.exports = {
  overrides: [
    {
      files: ["@app/e2e/cypress/**"],
      plugins: ["cypress"],
      env: {
        "cypress/globals": true,
      },
    },
    {
      files: ["*.graphql"],
      rules: {
        "prettier/prettier": 0,
      },
    },
    {
      files: ["*.graphql"],
      parser: "@graphql-eslint/eslint-plugin",
      plugins: ["@graphql-eslint"],
      rules: {
        "@graphql-eslint/no-unreachable-types": ["error"],
        // "@graphql-eslint/no-deprecated": 0,
        "@graphql-eslint/unique-fragment-name": ["error"],
        "@graphql-eslint/unique-operation-name": ["error"],
        // "@graphql-eslint/no-hashtag-description": 0,
        "@graphql-eslint/no-anonymous-operations": ["error"],
        // "@graphql-eslint/require-deprecation-reason": 0,
        // "@graphql-eslint/selection-set-depth": 0,
        // "@graphql-eslint/no-case-insensitive-enum-values-duplicates": 0,
        // "@graphql-eslint/require-description": 0,
        // The below rule would be useful if it worked with fragments...
        // "@graphql-eslint/require-id-when-available": ["error"],
        // "@graphql-eslint/description-style": 0,
        "@graphql-eslint/no-duplicate-fields": ["error"],
        // "@graphql-eslint/naming-convention": 0,
        "@graphql-eslint/input-name": ["error", { checkInputType: true }],
        "@graphql-eslint/executable-definitions": ["error"],
        "@graphql-eslint/fields-on-correct-type": ["error"],
        "@graphql-eslint/fragments-on-composite-type": ["error"],
        "@graphql-eslint/known-argument-names": ["error"],
        "@graphql-eslint/known-directives": ["error"],
        // "@graphql-eslint/known-fragment-names": 0,
        "@graphql-eslint/known-type-names": ["error"],
        // "@graphql-eslint/lone-anonymous-operation": 0,
        // "@graphql-eslint/lone-schema-definition": 0,
        "@graphql-eslint/no-fragment-cycles": ["error"],
        "@graphql-eslint/no-undefined-variables": ["error"],
        // "@graphql-eslint/no-unused-fragments": 0,
        // "@graphql-eslint/no-unused-variables": 0,
        "@graphql-eslint/overlapping-fields-can-be-merged": ["error"],
        "@graphql-eslint/possible-fragment-spread": ["error"],
        "@graphql-eslint/possible-type-extension": ["error"],
        "@graphql-eslint/provided-required-arguments": ["error"],
        "@graphql-eslint/scalar-leafs": ["error"],
        "@graphql-eslint/one-field-subscriptions": ["error"],
        "@graphql-eslint/unique-argument-names": ["error"],
        "@graphql-eslint/unique-directive-names": ["error"],
        // "@graphql-eslint/unique-directive-names-per-location": 0,
        "@graphql-eslint/unique-enum-value-names": ["error"],
        "@graphql-eslint/unique-field-definition-names": ["error"],
        "@graphql-eslint/unique-input-field-names": ["error"],
        "@graphql-eslint/unique-operation-types": ["error"],
        "@graphql-eslint/unique-type-names": ["error"],
        "@graphql-eslint/unique-variable-names": ["error"],
        "@graphql-eslint/value-literals-of-correct-type": ["error"],
        "@graphql-eslint/variables-are-input-types": ["error"],
        "@graphql-eslint/variables-in-allowed-position": ["error"],
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs", "**/*.jsx"],
      parser: "@typescript-eslint/parser",
      extends: [
        "plugin:react/recommended",
        "plugin:import/errors",
        "plugin:import/recommended",
        "plugin:import/typescript",
        "prettier",
      ],
      plugins: [
        "jest",
        "@typescript-eslint",
        "react-hooks",
        "react",
        "simple-import-sort",
        "import",
      ],
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      settings: {
        react: {
          version: "detect",
        },
      },
      env: {
        browser: true,
        node: true,
        jest: true,
        es6: true,
      },
      rules: {
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
          },
        ],
        "no-unused-expressions": [
          "error",
          {
            allowTernary: true,
          },
        ],
        "no-console": 0,
        "no-confusing-arrow": 0,
        "no-else-return": 0,
        "no-return-assign": [2, "except-parens"],
        "no-underscore-dangle": 0,
        "jest/no-focused-tests": 2,
        "jest/no-identical-title": 2,
        camelcase: 0,
        "prefer-arrow-callback": [
          "error",
          {
            allowNamedFunctions: true,
          },
        ],
        "class-methods-use-this": 0,
        "no-restricted-syntax": 0,
        "no-param-reassign": [
          "error",
          {
            props: false,
          },
        ],
        "react/prop-types": 0,
        "react/no-multi-comp": 0,
        // Next.js automatically imports React
        "react/react-in-jsx-scope": "off",
        "react/jsx-filename-extension": [1, { extensions: [".ts", ".tsx"] }],
        "react/no-unescaped-entities": 0,

        "import/no-extraneous-dependencies": 0,
        "react/destructuring-assignment": 0,

        "arrow-body-style": 0,
        "no-nested-ternary": 0,

        // Sort component props alphabetically
        "react/jsx-sort-props": [
          1,
          {
            callbacksLast: true,
            shorthandLast: true,
            reservedFirst: true,
          },
        ],

        /*
         * simple-import-sort seems to be the most stable import sorting currently,
         * disable others
         */
        "simple-import-sort/imports": [
          "error",
          {
            groups: [
              // Node.js builtins
              [`^(${require("module").builtinModules.join("|")})(/|$)`],
              // Packages. `react` related packages come first.
              ["^react", "^@?\\w"],
              // Side effect imports.
              ["^\\u0000"],
              // Parent imports. Put `..` last.
              ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
              // Other relative imports. Put same-folder imports and `.` last.
              ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
              // Style imports.
              ["^.+\\.s?css$"],
              // Type imports
              ["^.+\u0000$"],
            ],
          },
        ],
        "simple-import-sort/exports": "error",
        "sort-imports": "off",
        "import/first": "error",
        "import/newline-after-import": "error",
        "import/no-duplicates": "error",

        "import/no-deprecated": "warn",
        "import/no-duplicates": "error",
      },
    },
  ],
}
