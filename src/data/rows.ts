import type { Budget, BudgetPeriod, PurchaseRequest, Urgency } from "@/domain/request";
import type { RequestStatus } from "@/domain/status";

export type RequestRow = {
  id: string;
  reference: string;
  slack_user_id: string;
  requester_name: string;
  item: string | null;
  quantity: number | null;
  unit: string | null;
  budget_amount_cents: string | null;
  budget_period: string | null;
  budget_currency: string | null;
  amount_in_message: boolean;
  team: string | null;
  urgency: string | null;
  reason: string | null;
  status: string;
  parse_confidence: string | null;
  parse_rationale: string | null;
  parse_model: string | null;
  cap_quantity: number | null;
  cap_annual_cents: string | null;
  created_at: Date;
  updated_at: Date;
};

function toBudget(row: RequestRow): Budget | null {
  if (row.budget_amount_cents === null) return null;
  return {
    // Postgres returns bigint and numeric as strings to protect precision.
    amountCents: Number(row.budget_amount_cents),
    period: row.budget_period as BudgetPeriod | null,
    currency: row.budget_currency,
  };
}

export function toPurchaseRequest(row: RequestRow): PurchaseRequest {
  return {
    id: row.id,
    reference: row.reference,
    requester: {
      slackUserId: row.slack_user_id,
      displayName: row.requester_name,
    },
    item: row.item,
    quantity: row.quantity,
    unit: row.unit,
    budget: toBudget(row),
    amountInMessage: row.amount_in_message,
    team: row.team,
    urgency: row.urgency as Urgency | null,
    reason: row.reason,
    status: row.status as RequestStatus,
    reading: row.parse_model
      ? {
          confidence: Number(row.parse_confidence),
          rationale: row.parse_rationale,
          model: row.parse_model,
        }
      : null,
    cap:
      row.cap_quantity !== null || row.cap_annual_cents !== null
        ? {
            quantity: row.cap_quantity,
            annualCents: row.cap_annual_cents === null ? null : Number(row.cap_annual_cents),
          }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
