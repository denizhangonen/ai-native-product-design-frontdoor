import { z } from "zod";

const messageEventSchema = z.object({
  type: z.literal("message"),
  channel: z.string(),
  user: z.string().optional(),
  text: z.string().optional(),
  ts: z.string(),
  thread_ts: z.string().optional(),
  subtype: z.string().optional(),
  bot_id: z.string().optional(),
});

const envelopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("url_verification"),
    challenge: z.string(),
  }),
  z.object({
    type: z.literal("event_callback"),
    event_id: z.string(),
    event: z.looseObject({ type: z.string() }),
  }),
]);

const SPOKEN_SUBTYPES = new Set(["file_share", "thread_broadcast"]);

export type SlackMessage = {
  eventId: string;
  channelId: string;
  slackUserId: string;
  messageTs: string;
  /** Set when the message is a reply inside a thread; the thread's opening message. */
  threadTs: string | null;
  text: string;
};

/** A message inside a thread. Narrowed once, so handlers never assert on `threadTs`. */
export type ThreadReply = SlackMessage & { threadTs: string };

export function isThreadReply(message: SlackMessage): message is ThreadReply {
  return message.threadTs !== null;
}

export type SlackIntake =
  | { kind: "challenge"; challenge: string }
  | { kind: "message"; message: SlackMessage }
  | { kind: "ignored"; reason: string }
  | { kind: "unreadable"; reason: string };

/**
 * Decides what a Slack delivery is. Everything the flow should not react to is
 * ignored here rather than deeper in, so the reasons stay in one readable list.
 * Thread replies pass through: whether one matters is the service's decision.
 */
export function classifyDelivery(payload: unknown, channelId: string): SlackIntake {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) return { kind: "unreadable", reason: "unrecognised envelope" };

  if (envelope.data.type === "url_verification") {
    return { kind: "challenge", challenge: envelope.data.challenge };
  }

  const { event_id, event } = envelope.data;
  if (event.type !== "message") return { kind: "ignored", reason: `event type ${event.type}` };

  const message = messageEventSchema.safeParse(event);
  if (!message.success) return { kind: "unreadable", reason: "unrecognised message event" };

  const { channel, user, text, ts, thread_ts, subtype, bot_id } = message.data;

  if (bot_id) return { kind: "ignored", reason: "posted by a bot" };
  // Edits, joins, and deletions all arrive as subtypes and never start a request. A message
  // with a file attached, or a reply also sent to the channel, is still a person asking.
  if (subtype && !SPOKEN_SUBTYPES.has(subtype)) {
    return { kind: "ignored", reason: `message subtype ${subtype}` };
  }
  if (channel !== channelId) return { kind: "ignored", reason: "different channel" };
  if (!user) return { kind: "ignored", reason: "no author" };
  if (!text || !text.trim()) return { kind: "ignored", reason: "empty message" };

  return {
    kind: "message",
    message: {
      eventId: event_id,
      channelId: channel,
      slackUserId: user,
      messageTs: ts,
      // Slack sets thread_ts on the opening message too; only a different ts is a reply.
      threadTs: thread_ts && thread_ts !== ts ? thread_ts : null,
      text: text.trim(),
    },
  };
}
