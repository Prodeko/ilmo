import { Task } from "graphile-worker";

interface RegistrationTokenDeletionPayload {
  /**
   * secret token
   */
  tokenId: string;
}

// 30 minutes
const TOKEN_EXPIRATION_TIMEOUT = 1000 * 30 * 60;

const task: Task = async (rawPayload, { withPgClient }) => {
  const payload: RegistrationTokenDeletionPayload = rawPayload as any;

  setTimeout(() => {
    withPgClient((client) =>
      client.query("delete from app_public.registration_tokens where id = $1", [
        payload.tokenId,
      ])
    );
  }, TOKEN_EXPIRATION_TIMEOUT);
};

module.exports = task;
