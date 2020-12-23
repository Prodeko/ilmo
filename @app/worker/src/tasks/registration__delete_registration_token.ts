import { Task } from "graphile-worker";

interface RegistrationTokenDeletionPayload {
  /**
   * secret token
   */
  token: string;
}

// 30 minutes
const TOKEN_EXPIRATION_TIMEOUT = 1000 * 30 * 60;

const task: Task = async (rawPayload, { withPgClient }) => {
  const payload: RegistrationTokenDeletionPayload = rawPayload as any;

  setTimeout(() => {
    withPgClient((client) =>
      client.query<{
        id: string;
        created_at: Date;
      }>("delete from app_public.registration_tokens where token = $1", [
        payload.token,
      ])
    );
  }, TOKEN_EXPIRATION_TIMEOUT);
};

module.exports = task;
