module.exports = (dir) => {
  const pkg = require(`${dir}/package.json`)

  return {
    // ts-jest v29 reads its config from the transform tuple, not from
    // `globals` (which it deprecated). See
    // https://kulshekhar.github.io/ts-jest/docs/getting-started/options
    transform: {
      "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
    },
    testMatch: ["<rootDir>/**/__tests__/**/*.test.[jt]s?(x)"],
    roots: [`<rootDir>`],

    rootDir: dir,
    displayName: pkg.name,

    // jest 29's resolver does not honour the `exports` field, so bare
    // subpath imports like `@typespec/ts-http-runtime/internal/logger`
    // (used transitively by @azure/storage-blob) fail to resolve. Map them
    // to their on-disk CJS paths.
    moduleNameMapper: {
      "^@typespec/ts-http-runtime/internal/(.+)$":
        "@typespec/ts-http-runtime/dist/commonjs/$1/internal.js",
    },
  }
}
