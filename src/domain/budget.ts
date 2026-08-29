import type { Budget, BudgetPeriod } from "@/domain/request";

const MONTHS_PER_YEAR = 12;

/** A one-off cost counts as a year's spend: the policy is about the size of a decision, not its cadence. */
export function annualiseCents(amountCents: number, period: BudgetPeriod): number {
  return period === "monthly" ? amountCents * MONTHS_PER_YEAR : amountCents;
}

/** Null when the period is unknown, so nothing downstream can compare an unknown figure. */
export function annualBudgetCents(budget: Budget): number | null {
  return budget.period === null ? null : annualiseCents(budget.amountCents, budget.period);
}
