import { parseRequest } from "@/ai/parseRequest";
import { missingFields } from "@/ai/schemas";
import type { SlackConfig } from "@/config";
import { findThreadOrigin, markInboundMessageProcessed } from "@/data/inboundMessages";
import { getRequest } from "@/data/requests";
import { InvalidTransition, ModelUnavailable, describeError } from "@/domain/errors";
import type { RequiredField } from "@/domain/fields";
import { scrubNote } from "@/domain/privacy";
import { judgeThreadReply } from "@/domain/thread";
import { postMessage } from "@/integrations/slack/client";
import type { ThreadReply } from "@/integrations/slack/events";
import { needMoreDetail, startFresh, stillReading } from "@/integrations/slack/replies";
import { announceRouting } from "@/services/announceRouting";
import { completeRequest, mergeFields } from "@/services/completeRequest";
import { extractionToFields } from "@/services/extractionToFields";
import type { HandleResult } from "@/services/handleSlackMessage";
import { askAgain } from "@/services/holdForDetail";

// Each half is capped on its own, so a long opening message cannot push the follow-up
// past the model's input limit and out of sight.
const MAX_ORIGIN_CHARS = 1_200;
const MAX_REPLY_CHARS = 700;

/**
 * A reply inside a thread matters only when the thread is a request still waiting
 * for detail and the reply is from the person who asked. Everything else is
 * conversation, and conversation gets no answer from a bot.
 */
export async function handleThreadReply(
  message: ThreadReply,
  slack: SlackConfig,
): Promise<HandleResult> {
  const thread = { channelId: message.channelId, threadTs: message.threadTs };
  const finish = async (result: HandleResult): Promise<HandleResult> => {
    await markInboundMessageProcessed(message.eventId);
    return result;
  };

  const origin = await findThreadOrigin(message.channelId, message.threadTs);
  if (origin.kind === "in_flight") {
    await say(slack, thread, stillReading());
    return finish("thread_in_flight");
  }
  const request = origin.kind === "request" ? await getRequest(origin.requestId) : null;
  if (origin.kind !== "request" || !request) {
    console.info({ event: "thread_reply_not_ours", eventId: message.eventId });
    return finish("thread_ignored");
  }

  const verdict = judgeThreadReply(request, message.slackUserId);
  if (verdict !== "answer") {
    console.info({ event: "thread_reply_ignored", reference: request.reference, verdict });
    return finish("thread_ignored");
  }

  const combined = `${origin.text.slice(0, MAX_ORIGIN_CHARS)}\n\nFollow-up: ${message.text.slice(0, MAX_REPLY_CHARS)}`;
  const outcome = await parseRequest(combined);
  if (outcome.kind === "failed") throw new ModelUnavailable(outcome.reason);

  // What is still missing is decided against the request as stored, never by the model alone.
  const answer =
    outcome.kind === "unreadable" ? null : extractionToFields(outcome.extraction, combined);
  const merged = answer ? mergeFields(request, answer) : request;
  const missing: RequiredField[] = missingFields({
    item: merged.item,
    amount: merged.budget?.amountCents ?? null,
  });

  if (missing.length > 0 || !answer || outcome.kind === "unreadable") {
    const asked = await askAgain(request.id, missing);
    await say(slack, thread, asked === "asked" ? needMoreDetail(missing) : startFresh(missing));
    return finish(asked === "asked" ? "asked_again" : "gave_up");
  }

  const { rationale, confidence } = outcome.extraction;
  try {
    const routed = await completeRequest({
      ...answer,
      requestId: request.id,
      reading: { confidence, rationale: scrubNote(rationale, request.requester.displayName), model: outcome.model },
    });
    await markInboundMessageProcessed(message.eventId);
    await announceRouting(slack, thread, routed.request, routed.policy);
    return "completed";
  } catch (error) {
    // Two quick replies: the first one completed the request, this one is conversation.
    if (error instanceof InvalidTransition) {
      console.info({ event: "thread_reply_late", reference: request.reference });
      return finish("thread_ignored");
    }
    throw error;
  }
}

/** The ask is already on the trail, so a Slack failure is logged, never thrown. */
async function say(
  slack: SlackConfig,
  thread: { channelId: string; threadTs: string },
  text: string,
): Promise<void> {
  try {
    await postMessage({
      botToken: slack.botToken,
      channel: thread.channelId,
      text,
      threadTs: thread.threadTs,
    });
  } catch (error) {
    console.error({ event: "reply_failed", ...describeError(error) });
  }
}
