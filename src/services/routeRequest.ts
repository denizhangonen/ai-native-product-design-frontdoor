import { getConfig } from "@/config";
import type { Executor } from "@/data/db";
import { updateStatus } from "@/data/requests";
import { appendTrail } from "@/data/trail";
import { annualBudgetCents } from "@/domain/budget";
import { type PolicyDecision, decidePolicy } from "@/domain/policy";
import type { CompleteRequest, PurchaseRequest } from "@/domain/request";
import { transition } from "@/domain/status";

export type RoutedRequest = {
  request: PurchaseRequest;
  policy: PolicyDecision;
};

export function policyThresholdCents(): number {
  return Math.round(getConfig().POLICY_THRESHOLD_USD_PER_YEAR * 100);
}

/**
 * Applies the policy to a complete request inside the caller's transaction. Shared by
 * the first message and the follow-up that completes one, so both route the same way.
 */
export async function routeRequest(request: CompleteRequest, tx: Executor): Promise<RoutedRequest> {
  const policy = decidePolicy(request.budget, policyThresholdCents(), request.amountInMessage);
  const event = policy.route === "guided" ? "guided" : "routed";

  const status = transition(request.status, event);
  const routed = await updateStatus(request.id, status, tx);

  await appendTrail(
    {
      requestId: routed.id,
      type: event,
      actor: "system",
      payload: {
        route: policy.route,
        reason: policy.reason,
        flags: policy.flags,
        annualCents: annualBudgetCents(request.budget),
      },
    },
    tx,
  );

  return { request: routed, policy };
}
