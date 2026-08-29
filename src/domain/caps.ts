import { annualBudgetCents, annualiseCents } from "@/domain/budget";
import type { Budget, Cap, CompleteRequest } from "@/domain/request";

/** What the model reports procurement wrote. Whether it can be acted on is decided here. */
export type CapReading = {
  quantity: number | null;
  annualCents: number | null;
};

const MIN_CAP = 1;
const CAP_CURRENCY = "USD";

/**
 * A cap is only acted on when it is a real limit on what was asked. A cap above the
 * request, below one, or on a quantity the request never had, is more likely a misread
 * than a decision, so the system asks again instead of deciding.
 */
export function isPlausibleCap(cap: CapReading, request: CompleteRequest): boolean {
  if (cap.quantity !== null) {
    if (request.quantity === null) return false;
    if (cap.quantity < MIN_CAP || cap.quantity > request.quantity) return false;
  }
  if (cap.annualCents !== null) {
    // A cap is read in dollars; it cannot narrow a request made in another currency.
    if (request.budget.currency !== CAP_CURRENCY) return false;
    const requested = annualBudgetCents(request.budget);
    if (requested === null) return false;
    if (cap.annualCents < MIN_CAP || cap.annualCents > requested) return false;
  }
  return true;
}

/** A cap equal to what was asked is a plain approval, so it is not recorded as a cap. */
export function resolveCap(cap: CapReading, request: CompleteRequest): Cap | null {
  const quantity =
    cap.quantity !== null && request.quantity !== null && cap.quantity < request.quantity
      ? cap.quantity
      : null;
  const requestedAnnual =
    request.budget.currency === CAP_CURRENCY ? annualBudgetCents(request.budget) : null;
  const annualCents =
    cap.annualCents !== null && requestedAnnual !== null && cap.annualCents < requestedAnnual
      ? cap.annualCents
      : null;
  if (quantity === null && annualCents === null) return null;
  return { quantity, annualCents };
}

export type ApprovedFigures = {
  quantity: number | null;
  budget: Budget;
};

/**
 * What the event card shows: the request as asked, narrowed by any cap. A money cap is
 * compared by the year but shown in the request's own period, so a one-off stays a one-off.
 */
export function approvedFigures(request: CompleteRequest, cap: Cap | null): ApprovedFigures {
  const quantity = cap?.quantity ?? request.quantity;
  if (cap?.annualCents == null) return { quantity, budget: request.budget };
  const period = request.budget.period ?? "annual";
  const amountCents = period === "monthly" ? Math.round(cap.annualCents / 12) : cap.annualCents;
  return { quantity, budget: { amountCents, period, currency: CAP_CURRENCY } };
}

/**
 * A money cap as procurement wrote it, by the year. A cap with no period takes the
 * request's own, so "up to $2k" on a yearly subscription means $2k a year.
 */
export function capToAnnualCents(
  amount: number,
  period: Budget["period"],
  request: CompleteRequest,
): number {
  const effective = period ?? request.budget.period ?? "annual";
  return annualiseCents(Math.round(amount * 100), effective);
}
