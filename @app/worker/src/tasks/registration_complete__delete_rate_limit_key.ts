import { Task } from "graphile-worker"
import Redis from "ioredis"

interface Payload {
  eventId: string
  quotaId: string
  ipAddress: string
}

const isTest = process.env.NODE_ENV === "test"
const url = isTest ? process.env.TEST_REDIS_URL : process.env.REDIS_URL

const task: Task = async (inPayload, _helpers) => {
  const payload: Payload = inPayload as any
  const { eventId, quotaId, ipAddress } = payload
  const client = new Redis(url)

  const key = `rate-limit:claimRegistrationToken:${eventId}:${quotaId}:${ipAddress}`
  client.del(key)
  client.quit()
}

module.exports = task
