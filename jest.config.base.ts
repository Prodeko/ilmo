module.exports = (dir) => {
  const pkg = require(`${dir}/package.json`)

  return {
    // Use https://kulshekhar.github.io/ts-jest/docs/next/guides/esm-support/
    // once https://github.com/facebook/jest/issues/9771 works correctly.
    // Otherwise we get a bunch of errors like this:
    // "SyntaxError: The requested module 'pg' does not provide an export named 'Pool'""
    preset: "ts-jest",
    globals: {
      "ts-jest": {
        tsconfig: "tsconfig.test.json",
      },
    },
    testMatch: ["<rootDir>/**/__tests__/**/*.test.[jt]s?(x)"],
    roots: [`<rootDir>`],

    rootDir: dir,
    displayName: pkg.name,
  }
}
