import { Task } from "graphile-worker";

interface Payload {
  /**
   * Secret token used for event registration
   */
  token: string;
}

// 30 minutes
const TOKEN_EXPIRATION_TIMEOUT = 1000 * 30 * 60;

const task: Task = async (inPayload, { withPgClient }) => {
  const payload: Payload = inPayload as any;

  setTimeout(() => {
    try {
      withPgClient(async (client) => {
        const {
          rows: [row],
        } = await client.query(
          "select * from app_public.delete_registration_token($1::uuid)",
          [payload.token]
        );
        const numberOfRowsDeleted = row.delete_registration_token;

        if (numberOfRowsDeleted !== "1") {
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
