import { type Executor, db } from "@/data/db";
import type { Budget, BudgetPeriod } from "@/domain/request";

/** The record created when procurement says yes. A card, not a sourcing event. */
export type EventRecord = {
  id: string;
  requestId: string;
  title: string;
  quantity: number | null;
  unit: string | null;
  budget: Budget;
  owner: string;
  status: "created";
  createdAt: Date;
};

type EventRow = {
  id: string;
  request_id: string;
  title: string;
  quantity: number | null;
  unit: string | null;
  budget_amount_cents: string;
  budget_period: string | null;
  budget_currency: string | null;
  owner: string;
  status: string;
  created_at: Date;
};

function toEventRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    title: row.title,
    quantity: row.quantity,
    unit: row.unit,
    budget: {
      amountCents: Number(row.budget_amount_cents),
      period: row.budget_period as BudgetPeriod | null,
      currency: row.budget_currency,
    },
    owner: row.owner,
    status: "created",
    createdAt: row.created_at,
  };
}

export type InsertEventInput = {
  requestId: string;
  title: string;
  quantity: number | null;
  unit: string | null;
  budget: Budget;
};

export async function insertEvent(input: InsertEventInput, sql: Executor): Promise<EventRecord> {
  const [row] = await sql<EventRow[]>`
    insert into events (request_id, title, quantity, unit, budget_amount_cents, budget_period, budget_currency)
    values (${input.requestId}, ${input.title}, ${input.quantity}, ${input.unit},
            ${input.budget.amountCents}, ${input.budget.period}, ${input.budget.currency})
    returning *
  `;
  return toEventRecord(row);
}

export async function getEventForRequest(
  requestId: string,
  sql: Executor = db(),
): Promise<EventRecord | null> {
  const [row] = await sql<EventRow[]>`select * from events where request_id = ${requestId}`;
  return row ? toEventRecord(row) : null;
}
