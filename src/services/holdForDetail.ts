import { z } from "zod";
import { db } from "@/data/db";
import { insertRequest, updateStatus } from "@/data/requests";
import { appendTrail, countTrail } from "@/data/trail";
import { InvalidRequestInput } from "@/domain/errors";
import { REQUIRED_FIELDS } from "@/domain/fields";
import type { PurchaseRequest } from "@/domain/request";
import { transition } from "@/domain/status";
import { canAskAgain } from "@/domain/thread";
import {
  describeIssues,
  fieldsSchema,
  readingSchema,
  requesterSchema,
} from "@/services/requestInput";

const inputSchema = fieldsSchema
  .extend({
    requester: requesterSchema,
    missing: z.array(z.enum(REQUIRED_FIELDS)).min(1),
    reading: readingSchema,
  })
  // What is listed as missing must be exactly what is null, so a complete request is never parked.
  .refine(
    (input) => REQUIRED_FIELDS.every((field) => input.missing.includes(field) === (input[field] === null)),
    { path: ["missing"], message: "must list exactly the null fields" },
  );

export type HoldForDetailInput = z.input<typeof inputSchema>;

/** A request the policy cannot decide yet: stored with what was read, waiting for one answer. */
export async function holdForDetail(input: HoldForDetailInput): Promise<PurchaseRequest> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new InvalidRequestInput(describeIssues(parsed.error));

  const { missing, ...fields } = parsed.data;

  const request = await db().begin(async (tx) => {
    const created = await insertRequest({ ...fields, status: "received" }, tx);

    await appendTrail(
      {
        requestId: created.id,
        type: "created",
        actor: created.requester.slackUserId,
        payload: { item: created.item, confidence: created.reading?.confidence ?? null },
        reading: created.reading,
      },
      tx,
    );

    const held = await updateStatus(created.id, transition(created.status, "detail_requested"), tx);

    await appendTrail(
      { requestId: held.id, type: "detail_requested", actor: "system", payload: { missing } },
      tx,
    );

    return held;
  });

  console.info({ event: "request_held", reference: request.reference, missing });
  return request;
}

/**
 * A second question in the same thread, counted and recorded in one transaction so two
 * quick replies cannot both get one. "exhausted" means the person is told to start fresh.
 */
export async function askAgain(requestId: string, missing: string[]): Promise<"asked" | "exhausted"> {
  return db().begin(async (tx) => {
    const asks = await countTrail(requestId, "detail_requested", tx);
    if (!canAskAgain(asks)) return "exhausted";
    await appendTrail(
      { requestId, type: "detail_requested", actor: "system", payload: { missing } },
      tx,
    );
    return "asked";
  });
}
