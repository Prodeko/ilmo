import dayjs from "dayjs";
import { Task } from "graphile-worker";

import { SendEmailPayload } from "./send_email";

interface RegistrationSendConfirmationEmail {
  /**
   * registration id
   */
  id: string;
}

const { NODE_ENV, ROOT_URL } = process.env;
const isDev = NODE_ENV === "development";

function getFormattedEventTime(event: any) {
  const { start_time, end_time } = event;
  const formatString = "D.M.YY HH:mm";
  const startTime = dayjs(start_time).format(formatString);
  const endTime = dayjs(end_time).format(formatString);
  return `${startTime} - ${endTime}`;
}

const task: Task = async (inPayload, { addJob, withPgClient }) => {
  const payload: RegistrationSendConfirmationEmail = inPayload as any;
  const { id: registrationId } = payload;
  const {
    rows: [registration],
  } = await withPgClient((pgClient) =>
    pgClient.query(
      `
        select *
        from app_public.registrations
        where id = $1
      `,
      [registrationId]
    )
  );
  if (!registration) {
    console.error("Registration not found; aborting");
    return;
  }

  const {
    rows: [event],
  } = await withPgClient((pgClient) =>
    pgClient.query(`select * from app_public.events where id = $1`, [
      registration.event_id,
    ])
  );

  if (!event) {
    console.error(`No event found for ${registration.event_id}; aborting`);
    return;
  }

  const {
    rows: [quota],
  } = await withPgClient((pgClient) =>
    pgClient.query(`select * from app_public.quotas where id = $1`, [
      registration.quota_id,
    ])
  );

  if (!quota) {
    console.error(`No quota found for ${registration.quota_id}; aborting`);
    return;
  }

  let email = registration.email;
  const sendEmailPayload: SendEmailPayload = {
    options: {
      to: email,
      subject: `${event.name.en} - Registration successful`,
    },
    template: "event_registration.mjml",
    variables: {
      eventNameFi: event.name.fi,
      eventNameEn: event.name.en,
      registrationName: `${registration.first_name} ${registration.last_name}`,
      registrationQuotaFi: quota.title.fi,
      registrationQuotaEn: quota.title.en,
      eventTime: getFormattedEventTime(event),
      eventLink: `${ROOT_URL}/${event.slug}`,
      eventRegistrationDeleteLink: ``,
    },
  };

  if (!isDev) {
    // Don't send these emails in dev
    // Generating fake data with yarn db create-fake-data
    // would result in a large number of emails being sent.
    await addJob("send_email", sendEmailPayload);
  }
};

module.exports = task;
