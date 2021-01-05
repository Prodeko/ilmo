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
    try {
      withPgClient(async (client) => {
        const {
          rows: [numberOfRowsDeleted],
        } = await client.query(
          "select * from app_public.delete_registration_token($1::uuid)",
          [payload.token]
        );

        if (numberOfRowsDeleted !== 1) {
          throw new Error(
            `Worker task registration__delete_registration_token deleted unexpected number of rows: ${numberOfRowsDeleted}, token: ${payload.token}`
          );
        }
      });
    } catch (e) {
      throw e;
    }
  }, TOKEN_EXPIRATION_TIMEOUT);
};

module.exports = task;
