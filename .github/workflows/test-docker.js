const fetch = require("node-fetch")
const AbortController = require("abort-controller")
const { execSync } = require("child_process")

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  let attempts = 0
  let response
  while (true) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => {
        controller.abort()
      }, 8000)
      try {
        response = await fetch("http://0.0.0.0:5678", {
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
      if (response.status !== 200) {
        throw new Error("Try again")
      }
      break
    } catch (e) {
      attempts++
      if (attempts <= 30) {
        console.log(`Server is not ready yet: ${e.message}`)
        execSync("docker logs ilmo-server", { stdio: "inherit" })
        execSync("docker logs ilmo-worker", { stdio: "inherit" })
      } else {
        console.log(`Server never came up, aborting :(`)
        process.exit(1)
      }
      await sleep(1000)
    }
  }
  const text = await response.text()

  // Check for known text on homepage
  if (!text.includes("Prodeko")) {
    throw new Error("Failed to confirm server works.")
  }

  // TODO: make this test depend on the worker running
  console.log("Docker tests passed.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
