import { Task } from "graphile-worker";
import { createNodeRedisClient } from "handy-redis";

interface Payload {
  eventId: string;
  ipAddress: string;
}

const isDev = process.env.NODE_ENV === "test";
const url = isDev ? process.env.TEST_REDIS_URL : process.env.TEST_REDIS_URL;

const task: Task = async (inPayload, _helpers) => {
  const payload: Payload = inPayload as any;
  const { eventId, ipAddress } = payload;
  const client = createNodeRedisClient({ url });

  const key = `rate-limit:claimRegistrationToken:${eventId}:${ipAddress}`;
  client.del(key);
  client.quit();
};

module.exports = task;
