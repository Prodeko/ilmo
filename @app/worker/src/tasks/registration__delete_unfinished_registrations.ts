import type { Task } from "graphile-worker"

// 10 minutes
const EXPIRATION_TIMEOUT = 10

const task: Task = async (_, { query }) => {
  // Delete unfinished registration and associated registration secret
  // after EXPIRATION_TIMEOUT has elapsed

  // We choose to not delete the rate limit key from redis here. The rate
  // limit key is only deleted from redis after successful event registration.
  // If the user does not complete their registration within 10 minutes
  // the rate limit key still exists in redis for 20 minutes until it expires.
  //
  // We would have to store the users ip adress in registration_secrets
  // table to use it here which would add some complexity.
  await query(
    `delete from app_public.registrations as r
      where
        age(current_timestamp, r.created_at) > interval '1 minutes' * $1
        and r.is_finished = false
    `,
    [EXPIRATION_TIMEOUT]
  )
}

export default task
