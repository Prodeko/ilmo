module.exports = (dir) => {
  const pkg = require(`${dir}/package.json`)

  return {
    // ts-jest v29 reads its config from the transform tuple, not from
    // `globals` (which it deprecated). See
    // https://kulshekhar.github.io/ts-jest/docs/getting-started/options
    transform: {
      "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
      "^.+\\.m?js$": [
        "ts-jest",
        { tsconfig: "tsconfig.test.json", diagnostics: false },
      ],
    },
    transformIgnorePatterns: [
      "/node_modules/(?!(openid-client|oauth4webapi|jose)/)",
    ],
    testMatch: ["<rootDir>/**/__tests__/**/*.test.[jt]s?(x)"],
    roots: [`<rootDir>`],

    rootDir: dir,
    displayName: pkg.name,
  }
}
