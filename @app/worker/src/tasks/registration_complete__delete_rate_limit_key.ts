import { Task } from "graphile-worker";

// eslint-disable-next-line
const task: Task = async (rawPayload, { withPgClient }) => {
  // TODO: Delete rate limit key from redis
  // call this from function app_public.create_registration
};

module.exports = task;
