import { countRepliesFrom } from "@/data/inboundEmails";
import type { CompleteRequest } from "@/domain/request";
import type { ClarificationReason } from "@/integrations/email/messages";
import { sendClarification } from "@/integrations/email/send";

/** Replies answered per sender per request before the system goes quiet. A loop guard. */
export const MAX_ANSWERED_REPLIES = 5;

/**
 * Answers a reply that changed nothing, unless this sender has already been answered
 * enough times about this request: a mailbox that answers back must not keep it going.
 */
export async function answerReply(
  request: CompleteRequest | null,
  from: string,
  messageId: string,
  reason: ClarificationReason,
): Promise<void> {
  const reference = request?.reference ?? null;
  if ((await countRepliesFrom(from, reference)) > MAX_ANSWERED_REPLIES) {
    console.warn({ event: "clarification_limit_reached", reference });
    return;
  }
  await sendClarification(request, from, messageId, reason);
}

