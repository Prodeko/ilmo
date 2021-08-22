const { randomBytes } = require("crypto")

function safeRandomString(length) {
  // Roughly equivalent to shell `openssl rand -base64 30 | tr '+/' '-_'`
  return randomBytes(length)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function safeRandomHexString(length) {
  return [...Array(length)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join("")
}

module.exports = {
  safeRandomString,
  safeRandomHexString,
}
