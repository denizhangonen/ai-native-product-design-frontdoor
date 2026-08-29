import type { Budget, BudgetPeriod } from "@/domain/request";

const GUIDED_CURRENCY = "USD";

export function formatMoney(cents: number, currency: string | null = GUIDED_CURRENCY): string {
  const whole = Number.isInteger(cents / 100);
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (currency === GUIDED_CURRENCY) return `$${amount}`;
  return currency === null ? amount : `${currency} ${amount}`;
}

const PERIOD_SUFFIX: Record<BudgetPeriod, string> = {
  one_off: " one-off",
  monthly: "/month",
  annual: "/year",
};

/** What was read, with what was not said made visible: "3,000/year (currency not stated)". */
export function formatBudget(budget: Budget): string {
  const money = formatMoney(budget.amountCents, budget.currency);
  const suffix = budget.period === null ? "" : PERIOD_SUFFIX[budget.period];
  const unstated = [
    budget.currency === null ? "currency" : null,
    budget.period === null ? "period" : null,
  ].filter(Boolean);
  const note = unstated.length > 0 ? ` (${unstated.join(" and ")} not stated)` : "";
  return `${money}${suffix}${note}`;
}

export function formatQuantity(quantity: number, unit: string | null): string {
  if (unit) return `${quantity} ${unit}`;
  return quantity === 1 ? "1 unit" : `${quantity} units`;
}

/** One line a person would recognise their own request in, e.g. "Figma, 5 seats, $3,000/year". */
export function describeRequest(request: {
  item: string;
  quantity: number | null;
  unit: string | null;
  budget: Budget;
}): string {
  const parts = [request.item];
  if (request.quantity !== null) parts.push(formatQuantity(request.quantity, request.unit));
  parts.push(formatBudget(request.budget));
  return parts.join(", ");
}
