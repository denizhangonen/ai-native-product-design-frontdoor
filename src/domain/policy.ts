import { annualBudgetCents } from "@/domain/budget";
import { formatBudget, formatMoney } from "@/domain/format";
import type { Budget } from "@/domain/request";

export type PolicyRoute = "guided" | "procurement";

export const POLICY_FLAGS = [
  "amount_not_in_message",
  "currency_not_stated",
  "currency_not_usd",
  "period_not_stated",
] as const;
export type PolicyFlag = (typeof POLICY_FLAGS)[number];

export type PolicyDecision = {
  route: PolicyRoute;
  reason: string;
  /** Why the guided path was closed even before the threshold was looked at. */
  flags: PolicyFlag[];
};

const GUIDED_CURRENCY = "USD";

const FLAG_REASON: Record<PolicyFlag, string> = {
  amount_not_in_message: "the figure the model read is not written in the message",
  currency_not_stated: "no currency was stated",
  currency_not_usd: "the budget is not in USD",
  period_not_stated: "no billing period was stated (so the annual figure is unknown)",
};

export function describeFlag(flag: PolicyFlag): string {
  return FLAG_REASON[flag];
}

/**
 * The only place that decides whether a person must look at a request. The model
 * never decides this. Anything the rule cannot compare fails closed to procurement.
 */
export function decidePolicy(
  budget: Budget,
  thresholdCents: number,
  amountInMessage = true,
): PolicyDecision {
  const threshold = `${formatMoney(thresholdCents)}/year threshold`;

  const flags: PolicyFlag[] = [];
  if (!amountInMessage) flags.push("amount_not_in_message");
  if (budget.currency === null) flags.push("currency_not_stated");
  else if (budget.currency !== GUIDED_CURRENCY) flags.push("currency_not_usd");
  if (budget.period === null) flags.push("period_not_stated");

  if (flags.length > 0) {
    const because = flags.map(describeFlag).join(" and ");
    return {
      route: "procurement",
      reason: `Fails closed: ${because}, so procurement must look at it`,
      flags,
    };
  }

  const annualCents = annualBudgetCents(budget);
  // Both flags are clear, so the period is known and the figure exists.
  if (annualCents === null) throw new Error("annual budget unknown without a flag");

  const asRead = budget.period === "annual" ? "" : ` (${formatBudget(budget)})`;
  const annual = `${formatMoney(annualCents)}/year${asRead}`;

  if (annualCents > thresholdCents) {
    return {
      route: "procurement",
      reason: `${annual} is above the ${threshold}, so procurement must approve`,
      flags,
    };
  }

  return { route: "guided", reason: `${annual} is within the ${threshold}`, flags };
}
