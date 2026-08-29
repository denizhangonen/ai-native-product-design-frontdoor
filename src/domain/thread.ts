import type { PurchaseRequest } from "@/domain/request";

/** How many times the bot may ask in a thread before telling the person to start fresh. */
export const MAX_DETAIL_ASKS = 2;

export type ThreadVerdict = "answer" | "not_waiting" | "not_requester";

/**
 * Whether a thread reply may fill in a request. Only the person who asked, and only
 * while the request is still waiting. Anyone else in the thread is conversation.
 */
export function judgeThreadReply(request: PurchaseRequest, slackUserId: string): ThreadVerdict {
  if (request.status !== "needs_detail") return "not_waiting";
  if (request.requester.slackUserId !== slackUserId) return "not_requester";
  return "answer";
}

export function canAskAgain(asksSoFar: number): boolean {
  return asksSoFar < MAX_DETAIL_ASKS;
}
