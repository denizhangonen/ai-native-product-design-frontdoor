import type { RequestStatus } from "@/domain/status";

export const BUDGET_PERIODS = ["one_off", "monthly", "annual"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const URGENCIES = ["this_week", "this_month", "this_quarter", "flexible"] as const;
/** Shown to procurement, never used to route: routing on it would put a model's judgement in the decision path. */
export type Urgency = (typeof URGENCIES)[number];

export type Budget = {
  amountCents: number;
  /** Null when the message did not say. The policy then fails closed. */
  period: BudgetPeriod | null;
  /** ISO code, or null when the message gave neither a symbol nor a code. Only USD can be guided. */
  currency: string | null;
};

/** How the model read the message. It never decides anything; it only reports. */
export type Reading = {
  confidence: number;
  rationale: string | null;
  model: string;
};

export type Requester = {
  slackUserId: string;
  displayName: string;
};

/** What procurement allowed, when it is less than what was asked. */
export type Cap = {
  quantity: number | null;
  annualCents: number | null;
};

export type PurchaseRequest = {
  id: string;
  /** Human-facing identifier used in email subjects, e.g. PI-1042. */
  reference: string;
  requester: Requester;
  /** Null only while the request is waiting for detail. */
  item: string | null;
  quantity: number | null;
  /** What the quantity counts, e.g. "seats". */
  unit: string | null;
  /** Null only while the request is waiting for detail. */
  budget: Budget | null;
  /** Whether the budget figure is written in the message, checked by code. False fails closed. */
  amountInMessage: boolean;
  team: string | null;
  urgency: Urgency | null;
  reason: string | null;
  status: RequestStatus;
  reading: Reading | null;
  cap: Cap | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A request that has everything the policy needs. */
export type CompleteRequest = PurchaseRequest & { item: string; budget: Budget };

export function isComplete(request: PurchaseRequest): request is CompleteRequest {
  return request.item !== null && request.budget !== null;
}
