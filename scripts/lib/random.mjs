import { randomBytes } from "crypto"

export function safeRandomString(length) {
  // Roughly equivalent to shell `openssl rand -base64 30 | tr '+/' '-_'`
  return randomBytes(length)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

export function safeRandomHexString(length) {
  return [...Array(length)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join("")
}
