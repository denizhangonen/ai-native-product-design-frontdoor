import { getConfig } from "@/config";
import type { SlackConfig } from "@/config";
import { db } from "@/data/db";
import { appendTrail } from "@/data/trail";
import { describeError } from "@/domain/errors";
import type { PolicyDecision } from "@/domain/policy";
import { type PurchaseRequest, isComplete } from "@/domain/request";
import { sendBrief } from "@/integrations/email/send";
import { postMessage } from "@/integrations/slack/client";
import { briefNotSent, understood } from "@/integrations/slack/replies";

export type Thread = { channelId: string; threadTs: string };

/**
 * Sends the brief when procurement must look, then tells the requester what was
 * understood and where it went, in their thread. Never throws: the request is
 * already saved, and a failed message must not be reported as a failed request.
 */
export async function announceRouting(
  slack: SlackConfig,
  thread: Thread,
  request: PurchaseRequest,
  policy: PolicyDecision,
): Promise<"announced" | "failed"> {
  // A routed request is complete by construction; the type cannot see that.
  if (!isComplete(request)) throw new Error(`request ${request.reference} is not complete`);

  let briefSent = true;
  if (policy.route === "procurement") {
    // The request is already saved, so a mail outage delays the decision, it does not lose it.
    // It is written down and said out loud, so nobody believes procurement has been told.
    try {
      await sendBrief(request, policy);
    } catch (error) {
      briefSent = false;
      console.error({ event: "brief_failed", reference: request.reference, ...describeError(error) });
      await db().begin((tx) =>
        appendTrail({ requestId: request.id, type: "brief_failed", actor: "system" }, tx),
      );
    }
  }

  try {
    await postMessage({
      botToken: slack.botToken,
      channel: thread.channelId,
      text: briefSent ? understood(request, policy, getConfig().POLICY_URL) : briefNotSent(request),
      threadTs: thread.threadTs,
    });
    return "announced";
  } catch (error) {
    console.error({ event: "announce_failed", reference: request.reference, ...describeError(error) });
    return "failed";
  }
}
