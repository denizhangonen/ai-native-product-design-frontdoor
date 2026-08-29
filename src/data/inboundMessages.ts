import { type Executor, db } from "@/data/db";
import { type Intake, claimExisting, releaseClaim } from "@/data/intakeClaim";


export type { Intake };

/** A Slack delivery as the data layer needs it; the integration's message satisfies it. */
export type InboundMessage = {
  eventId: string;
  channelId: string;
  slackUserId: string;
  messageTs: string;
  threadTs: string | null;
  text: string;
};

// As much as the model is ever shown; anything past it is never read, so never kept.
const MAX_STORED_CHARS = 2_000;

/**
 * Stores a delivery once and says whether this caller owns it. Slack redelivers an
 * event it thinks we missed, so the answer must tell a dead attempt from a slow one.
 */
export async function recordInboundMessage(
  message: InboundMessage,
  sql: Executor = db(),
): Promise<Intake> {
  // Only an opening message is kept; a reply is read once with it and never again.
  const text = message.threadTs === null ? message.text.slice(0, MAX_STORED_CHARS) : null;
  const inserted = await sql`
    insert into inbound_messages (event_id, channel_id, slack_user_id, message_ts, thread_ts, text)
    values (${message.eventId}, ${message.channelId}, ${message.slackUserId},
            ${message.messageTs}, ${message.threadTs}, ${text})
    on conflict (event_id) do nothing
    returning id
  `;
  if (inserted.length > 0) return "new";

  return claimExisting("inbound_messages", message.eventId, sql);
}

/** The request a delivery already produced, so a retry does not create a second one. */
export async function findLinkedRequest(
  eventId: string,
  sql: Executor = db(),
): Promise<string | null> {
  const [row] = await sql<{ request_id: string | null }[]>`
    select request_id from inbound_messages where event_id = ${eventId}
  `;
  return row?.request_id ?? null;
}

export async function releaseInboundMessage(eventId: string, sql: Executor = db()): Promise<void> {
  await releaseClaim("inbound_messages", eventId, sql);
}

export async function markInboundMessageProcessed(
  eventId: string,
  sql: Executor = db(),
): Promise<void> {
  await sql`update inbound_messages set processed_at = now() where event_id = ${eventId}`;
}

export async function linkRequest(
  eventId: string,
  requestId: string,
  sql: Executor = db(),
): Promise<void> {
  await sql`update inbound_messages set request_id = ${requestId} where event_id = ${eventId}`;
}

export type SlackOrigin = {
  channelId: string;
  messageTs: string;
};

/** Where to reply about a request, so the requester hears back in their own thread. */
export async function findSlackOrigin(
  requestId: string,
  sql: Executor = db(),
): Promise<SlackOrigin | null> {
  const [row] = await sql<{ channel_id: string; message_ts: string }[]>`
    select channel_id, message_ts from inbound_messages where request_id = ${requestId}
  `;
  return row ? { channelId: row.channel_id, messageTs: row.message_ts } : null;
}

/**
 * Deliveries that never became a request (strangers' thread replies, messages that
 * could not be read) are kept only long enough to de-duplicate a retry.
 */
export async function pruneUnlinkedMessages(olderThanDays: number, sql: Executor = db()): Promise<number> {
  const rows = await sql`
    delete from inbound_messages
     where request_id is null
       and processed_at is not null
       and received_at < now() - ${`${olderThanDays} days`}::interval
    returning id
  `;
  return rows.length;
}

export type ThreadOrigin =
  | { kind: "request"; requestId: string; text: string }
  /** The opening message is ours but still being read, so its request does not exist yet. */
  | { kind: "in_flight" }
  | { kind: "not_ours" };

/** What a thread belongs to, found through its opening message. */
export async function findThreadOrigin(
  channelId: string,
  threadTs: string,
  sql: Executor = db(),
): Promise<ThreadOrigin> {
  const [row] = await sql<{ request_id: string | null; text: string | null; processed_at: Date | null }[]>`
    select request_id, text, processed_at from inbound_messages
     where channel_id = ${channelId} and message_ts = ${threadTs} and thread_ts is null
  `;
  if (!row) return { kind: "not_ours" };
  if (row.request_id !== null) return { kind: "request", requestId: row.request_id, text: row.text ?? "" };
  return row.processed_at === null ? { kind: "in_flight" } : { kind: "not_ours" };
}
