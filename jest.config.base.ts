module.exports = (dir) => {
  const pkg = require(`${dir}/package.json`)

  return {
    preset: "ts-jest",
    prettierPath: null,
    transform: {
      "^.+\\.(ts|js)x?$": [
        "ts-jest",
        {
          tsconfig: "<rootDir>/../../tsconfig.test.json",
        },
      ],
    },
    testMatch: ["<rootDir>/**/__tests__/**/*.test.[jt]s?(x)"],
    roots: [`<rootDir>`],

    rootDir: dir,
    displayName: pkg.name,
  }
}
