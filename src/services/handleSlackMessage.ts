import { parseRequest } from "@/ai/parseRequest";
import type { SlackConfig } from "@/config";
import {
  findLinkedRequest,
  linkRequest,
  markInboundMessageProcessed,
  recordInboundMessage,
  releaseInboundMessage,
} from "@/data/inboundMessages";
import { ModelUnavailable, describeError } from "@/domain/errors";
import { scrubNote } from "@/domain/privacy";
import { getUserName, postMessage } from "@/integrations/slack/client";
import { type SlackMessage, isThreadReply } from "@/integrations/slack/events";
import { needMoreDetail, notUnderstood } from "@/integrations/slack/replies";
import { announceRouting } from "@/services/announceRouting";
import { extractionToFields } from "@/services/extractionToFields";
import { handleThreadReply } from "@/services/handleThreadReply";
import { holdForDetail } from "@/services/holdForDetail";
import { submitRequest } from "@/services/submitRequest";

export type HandleResult =
  | "submitted"
  | "held"
  | "completed"
  | "asked_again"
  | "gave_up"
  | "not_understood"
  | "thread_ignored"
  | "thread_in_flight"
  | "duplicate"
  | "in_flight";

export async function handleSlackMessage(
  message: SlackMessage,
  slack: SlackConfig,
): Promise<HandleResult> {
  const intake = await recordInboundMessage(message);
  if (intake === "duplicate") return "duplicate";
  // Slack redelivers anything we do not answer within three seconds. While the
  // first attempt is still running, the redelivery must do nothing at all.
  if (intake === "in_flight") {
    console.info({ event: "slack_delivery_in_flight", eventId: message.eventId });
    return "in_flight";
  }
  // A previous attempt died after creating the request but before saying so.
  if (intake === "retry" && (await findLinkedRequest(message.eventId))) {
    console.warn({ event: "slack_retry_already_created", eventId: message.eventId });
    await markInboundMessageProcessed(message.eventId);
    return "duplicate";
  }

  try {
    if (isThreadReply(message)) return await handleThreadReply(message, slack);
    return await readAndRoute(message, slack);
  } catch (error) {
    // Given back at once: Slack has its answer already, but a person who says it again
    // must not be told the first attempt is still running.
    await releaseInboundMessage(message.eventId);
    throw error;
  }
}

async function readAndRoute(message: SlackMessage, slack: SlackConfig): Promise<HandleResult> {
  // The model call and the name lookup run together rather than one after the other.
  const [outcome, displayName] = await Promise.all([
    parseRequest(message.text),
    resolveDisplayName(slack, message.slackUserId),
  ]);
  const requester = { slackUserId: message.slackUserId, displayName };
  const thread = { channelId: message.channelId, threadTs: message.messageTs };

  // Left unprocessed: an outage is not the person's fault and must not read as one.
  if (outcome.kind === "failed") throw new ModelUnavailable(outcome.reason);

  if (outcome.kind === "unreadable") {
    await reply(slack, message, notUnderstood());
    await markInboundMessageProcessed(message.eventId);
    return "not_understood";
  }

  const { rationale, confidence } = outcome.extraction;
  const reading = { confidence, rationale: scrubNote(rationale, displayName), model: outcome.model };
  const fields = extractionToFields(outcome.extraction, message.text);

  if (outcome.kind === "incomplete") {
    const held = await holdForDetail({ ...fields, requester, missing: outcome.missing, reading });
    await linkRequest(message.eventId, held.id);
    await markInboundMessageProcessed(message.eventId);
    await replyAfterSave(slack, message, needMoreDetail(outcome.missing), held.reference);
    return "held";
  }

  // A parsed outcome has both; the field conversion cannot carry that proof.
  if (fields.item === null || fields.budget === null) throw new Error("parsed request incomplete");
  const { request, policy } = await submitRequest({
    ...fields,
    item: fields.item,
    budget: fields.budget,
    requester,
    reading,
  });

  // Marked done as soon as the request exists: a later failure must not cause a
  // retry to create the same request twice.
  await linkRequest(message.eventId, request.id);
  await markInboundMessageProcessed(message.eventId);

  await announceRouting(slack, thread, request, policy);
  return "submitted";
}

/** A display name is presentation only, so losing it must not cost us the request. */
async function resolveDisplayName(slack: SlackConfig, slackUserId: string): Promise<string> {
  try {
    return await getUserName(slack.botToken, slackUserId);
  } catch (error) {
    console.warn({ event: "slack_user_lookup_failed", ...describeError(error) });
    return slackUserId;
  }
}

function reply(slack: SlackConfig, message: SlackMessage, text: string): Promise<void> {
  return postMessage({
    botToken: slack.botToken,
    channel: message.channelId,
    text,
    threadTs: message.messageTs,
  });
}

/** Once the request is saved, a Slack failure is logged, never reported as a lost request. */
async function replyAfterSave(
  slack: SlackConfig,
  message: SlackMessage,
  text: string,
  reference: string,
): Promise<void> {
  try {
    await reply(slack, message, text);
  } catch (error) {
    console.error({ event: "reply_failed", reference, ...describeError(error) });
  }
}
