import { Task } from "graphile-worker";
import { createNodeRedisClient } from "handy-redis";

interface Payload {
  eventId: string;
  ipAddress: string;
}

const task: Task = async (inPayload, _helpers) => {
  const payload: Payload = inPayload as any;
  const { eventId, ipAddress } = payload;
  const client = createNodeRedisClient({ url: process.env.REDIS_URL });

  const key = `rate-limit:claimRegistrationToken:${eventId}:${ipAddress}`;
  await client.del(key);
};

module.exports = task;
