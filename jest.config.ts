export default {
  projects: ["<rootDir>/@app/*/jest.config.ts"],
  // Restart the test worker after a test file leaves it above this size, so
  // the heap stays bounded however many files run (see scripts/test.mjs).
  workerIdleMemoryLimit: "2GB",
}
