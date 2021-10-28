import Redis from "ioredis"

import type { Task } from "graphile-worker"

interface Payload {
  eventId: string
  quotaId: string
  ipAddress: string
}

const isTest = process.env.NODE_ENV === "test"
const url = isTest ? process.env.TEST_REDIS_URL : process.env.REDIS_URL

const task: Task = async (inPayload, _helpers) => {
  const client = new Redis(url)
  try {
    const payload: Payload = inPayload as any
    const { eventId, quotaId, ipAddress } = payload

    const key = `rate-limit:claimRegistrationToken:${eventId}:${quotaId}:${ipAddress}`
    client.del(key)
  } finally {
    await client.quit()
  }
}

export default task
