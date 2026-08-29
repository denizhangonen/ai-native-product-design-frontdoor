import { type Executor, MAX_LIST_LIMIT, db } from "@/data/db";

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

/** How sure the model was when it read the text behind this entry, and which model. */
export type TrailReading = {
  confidence: number;
  model: string;
};

export type TrailEntry = {
  id: number;
  requestId: string;
  type: string;
  actor: string;
  payload: JsonObject;
  reading: TrailReading | null;
  createdAt: Date;
};

type TrailRow = {
  id: string;
  request_id: string;
  type: string;
  actor: string;
  payload: JsonObject;
  reading_confidence: string | null;
  reading_model: string | null;
  created_at: Date;
};

function toTrailEntry(row: TrailRow): TrailEntry {
  return {
    id: Number(row.id),
    requestId: row.request_id,
    type: row.type,
    actor: row.actor,
    payload: row.payload,
    reading: row.reading_model
      ? { confidence: Number(row.reading_confidence), model: row.reading_model }
      : null,
    createdAt: row.created_at,
  };
}

export type AppendTrailInput = {
  requestId: string;
  type: string;
  actor: string;
  payload?: JsonObject;
  reading?: TrailReading | null;
};

export async function appendTrail(input: AppendTrailInput, sql: Executor): Promise<TrailEntry> {
  const [row] = await sql<TrailRow[]>`
    insert into trail (request_id, type, actor, payload, reading_confidence, reading_model)
    values (${input.requestId}, ${input.type}, ${input.actor}, ${sql.json(input.payload ?? {})},
            ${input.reading?.confidence ?? null}, ${input.reading?.model ?? null})
    returning *
  `;
  return toTrailEntry(row);
}

/** How many entries of one type a request has, read under the caller's transaction. */
export async function countTrail(requestId: string, type: string, sql: Executor): Promise<number> {
  const [row] = await sql<{ count: string }[]>`
    select count(*) as count from trail where request_id = ${requestId} and type = ${type}
  `;
  return Number(row?.count ?? 0);
}

export async function listTrail(
  requestId: string,
  limit = 100,
  sql: Executor = db(),
): Promise<TrailEntry[]> {
  const capped = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
  const rows = await sql<TrailRow[]>`
    select * from trail where request_id = ${requestId} order by created_at asc, id asc limit ${capped}
  `;
  return rows.map(toTrailEntry);
}
