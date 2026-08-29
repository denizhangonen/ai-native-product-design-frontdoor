import { type Executor, MAX_LIST_LIMIT, db } from "@/data/db";
import { type RequestRow, toPurchaseRequest } from "@/data/rows";
import type { Budget, Cap, PurchaseRequest, Reading, Requester, Urgency } from "@/domain/request";
import { type PublicRequest, toPublicRequest } from "@/domain/privacy";
import type { RequestStatus } from "@/domain/status";

/** The fields a message can carry. Null where it did not say. */
export type RequestFields = {
  amountInMessage: boolean;
  item: string | null;
  quantity: number | null;
  unit: string | null;
  budget: Budget | null;
  team: string | null;
  urgency: Urgency | null;
  reason: string | null;
};

export type InsertRequestInput = RequestFields & {
  requester: Requester;
  status: RequestStatus;
  reading: Reading | null;
};

// Writers take the caller's executor: a default pool handle inside a transaction would
// wait forever on the one connection the transaction holds.
export async function insertRequest(
  input: InsertRequestInput,
  sql: Executor,
): Promise<PurchaseRequest> {
  const [row] = await sql<RequestRow[]>`
    insert into requests
      (slack_user_id, requester_name, item, quantity, unit,
       budget_amount_cents, budget_period, budget_currency, amount_in_message,
       team, urgency, reason, status, parse_confidence, parse_rationale, parse_model)
    values
      (${input.requester.slackUserId}, ${input.requester.displayName}, ${input.item},
       ${input.quantity}, ${input.unit},
       ${input.budget?.amountCents ?? null}, ${input.budget?.period ?? null},
       ${input.budget?.currency ?? null}, ${input.amountInMessage},
       ${input.team}, ${input.urgency}, ${input.reason}, ${input.status},
       ${input.reading?.confidence ?? null}, ${input.reading?.rationale ?? null},
       ${input.reading?.model ?? null})
    returning *
  `;
  return toPurchaseRequest(row);
}

export async function getRequest(
  id: string,
  sql: Executor = db(),
): Promise<PurchaseRequest | null> {
  const [row] = await sql<RequestRow[]>`select * from requests where id = ${id}`;
  return row ? toPurchaseRequest(row) : null;
}

/**
 * Reads a request and holds the row until the transaction ends. Two replies
 * arriving at once are then serialised instead of overwriting each other.
 */
export async function getRequestForUpdate(
  id: string,
  sql: Executor,
): Promise<PurchaseRequest | null> {
  const [row] = await sql<RequestRow[]>`select * from requests where id = ${id} for update`;
  return row ? toPurchaseRequest(row) : null;
}

export async function getRequestByReference(
  reference: string,
  sql: Executor = db(),
): Promise<PurchaseRequest | null> {
  const [row] = await sql<RequestRow[]>`select * from requests where reference = ${reference}`;
  return row ? toPurchaseRequest(row) : null;
}

/** For the public page: never the requester, never the reason. */
export async function listRecentPublic(limit = 50, sql: Executor = db()): Promise<PublicRequest[]> {
  const capped = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
  const rows = await sql<RequestRow[]>`
    select * from requests order by created_at desc limit ${capped}
  `;
  return rows.map((row) => toPublicRequest(toPurchaseRequest(row)));
}

export async function getPublicRequestByReference(
  reference: string,
  sql: Executor = db(),
): Promise<PublicRequest | null> {
  const request = await getRequestByReference(reference, sql);
  return request ? toPublicRequest(request) : null;
}

export async function updateStatus(
  id: string,
  status: RequestStatus,
  sql: Executor,
): Promise<PurchaseRequest> {
  const [row] = await sql<RequestRow[]>`
    update requests set status = ${status}, updated_at = now() where id = ${id} returning *
  `;
  return toPurchaseRequest(row);
}

/** Fills in what a follow-up message added, and records how that reading went. */
export async function updateFields(
  id: string,
  fields: RequestFields,
  reading: Reading | null,
  sql: Executor,
): Promise<PurchaseRequest> {
  const [row] = await sql<RequestRow[]>`
    update requests
       set item = ${fields.item}, quantity = ${fields.quantity}, unit = ${fields.unit},
           budget_amount_cents = ${fields.budget?.amountCents ?? null},
           budget_period = ${fields.budget?.period ?? null},
           budget_currency = ${fields.budget?.currency ?? null},
           amount_in_message = ${fields.amountInMessage},
           team = ${fields.team}, urgency = ${fields.urgency}, reason = ${fields.reason},
           parse_confidence = ${reading?.confidence ?? null},
           parse_rationale = ${reading?.rationale ?? null},
           parse_model = ${reading?.model ?? null},
           updated_at = now()
     where id = ${id}
    returning *
  `;
  return toPurchaseRequest(row);
}

export async function updateStatusAndCap(
  id: string,
  status: RequestStatus,
  cap: Cap | null,
  sql: Executor,
): Promise<PurchaseRequest> {
  const [row] = await sql<RequestRow[]>`
    update requests
       set status = ${status}, cap_quantity = ${cap?.quantity ?? null},
           cap_annual_cents = ${cap?.annualCents ?? null}, updated_at = now()
     where id = ${id}
    returning *
  `;
  return toPurchaseRequest(row);
}
