const base = require("../../jest.config.base")(__dirname)

module.exports = {
  ...base,
  transform: {
    ...base.transform,
    // The shared test tsconfig has no JSX setting; components need one.
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
}
