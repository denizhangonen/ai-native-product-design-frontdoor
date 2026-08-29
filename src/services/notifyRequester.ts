import { getSlackConfig } from "@/config";
import { findSlackOrigin } from "@/data/inboundMessages";
import { describeError } from "@/domain/errors";
import { type PurchaseRequest, isComplete } from "@/domain/request";
import { postMessage } from "@/integrations/slack/client";
import { decided } from "@/integrations/slack/replies";

export type NotifyResult = "notified" | "no_origin" | "slack_not_configured" | "failed";

/**
 * Tells the requester, in the thread where they asked. Never throws: the decision is
 * already recorded, and a failed notification must not look like a failed decision.
 */
export async function notifyRequester(
  request: PurchaseRequest,
  note: string | null,
): Promise<NotifyResult> {
  const slack = getSlackConfig();
  if (!slack) return "slack_not_configured";
  // A decided request is complete by construction; the type cannot see that.
  if (!isComplete(request)) return "failed";

  const origin = await findSlackOrigin(request.id);
  if (!origin) {
    console.warn({ event: "notify_no_origin", reference: request.reference });
    return "no_origin";
  }

  try {
    await postMessage({
      botToken: slack.botToken,
      channel: origin.channelId,
      text: decided(request, note),
      threadTs: origin.messageTs,
    });
    return "notified";
  } catch (error) {
    console.error({ event: "notify_failed", reference: request.reference, ...describeError(error) });
    return "failed";
  }
}
