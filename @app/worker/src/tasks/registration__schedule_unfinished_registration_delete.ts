import { Task } from "graphile-worker";

interface Payload {
  /**
   * Secret token used for event registration
   */
  token: string;
}

// 10 minutes
const EXPIRATION_TIMEOUT = 1000 * 10 * 60;

const task: Task = async (inPayload, { withPgClient }) => {
  const payload: Payload = inPayload as any;

  // Delete unfinished registration and associated registration secret
  // after EXPIRATION_TIMEOUT has elapsed
  setTimeout(() => {
    try {
      withPgClient(async (client) => {
        // We choose to not delete the rate limit key from redis here. The rate
        // limit key is only deleted from redis after successful event registration.
        // If the user does not complete their registration within 10 minutes
        // the rate limit key still exists in redis for 20 minutes until it expires.
        // We would have to store the users ip adress in registration_secrets
        // table to use it here which would add some complexity.
        const {
          rows: [row],
        } = await client.query(
          "select * from app_private.registration_secrets where registration_token = $1",
          [payload.token]
        );
        await client.query(
          "delete from app_public.registrations where id = $1",
          [row.registration_id]
        );
      });
    } catch (e) {
      console.error(e);
    }
  }, EXPIRATION_TIMEOUT);
};

module.exports = task;
