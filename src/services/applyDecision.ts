import { z } from "zod";
import { db } from "@/data/db";
import { type EventRecord, insertEvent } from "@/data/events";
import { getRequestForUpdate, updateStatusAndCap } from "@/data/requests";
import { appendTrail } from "@/data/trail";
import { approvedFigures, isPlausibleCap, resolveCap } from "@/domain/caps";
import { InvalidRequestInput, InvalidTransition, RequestNotFound } from "@/domain/errors";
import { type PurchaseRequest, isComplete } from "@/domain/request";
import { type RequestStatus, transition } from "@/domain/status";
import { describeIssues } from "@/services/requestInput";

const inputSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  actor: z.string().min(1).max(320),
  note: z.string().min(1).max(2000).nullable().default(null),
  cap: z
    .object({
      quantity: z.number().int().min(1).max(100_000).nullable(),
      annualCents: z.number().int().min(1).max(1_000_000_000_00).nullable(),
    })
    .nullable()
    .default(null),
  /** How the model read the reply, kept on the trail so the page can show it. */
  reading: z
    .object({ confidence: z.number().min(0).max(1), model: z.string().min(1).max(100) })
    .nullable()
    .default(null),
});

export type ApplyDecisionInput = z.input<typeof inputSchema>;
export type Decision = ApplyDecisionInput["decision"];

const RESULT_OF: Record<Decision, RequestStatus> = {
  approve: "event_created",
  reject: "rejected",
};

export type ApplyDecisionResult = {
  request: PurchaseRequest;
  /** Present when this call created the event; absent on a rejection or a replay. */
  event: EventRecord | null;
  /** False when the same decision had already been applied. */
  changed: boolean;
};

export async function applyDecision(rawInput: ApplyDecisionInput): Promise<ApplyDecisionResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) throw new InvalidRequestInput(describeIssues(parsed.error));
  const input = parsed.data;

  // Read, decide and write in one transaction under a row lock. Reading first and
  // writing after would let two replies each act on the same stale status.
  const result = await db().begin<ApplyDecisionResult>(async (tx) => {
    const existing = await getRequestForUpdate(input.requestId, tx);
    if (!existing) throw new RequestNotFound(input.requestId);

    // Replaying the same decision is a no-op, so a duplicate email cannot double-record it.
    if (existing.status === RESULT_OF[input.decision]) {
      return { request: existing, event: null, changed: false };
    }

    const event = input.decision === "approve" ? "procurement_approved" : "procurement_rejected";
    const status = transition(existing.status, event);
    // The transition table only lets with_procurement through, and that status is complete.
    if (!isComplete(existing)) throw new InvalidTransition(existing.status, event);

    // A cap only means something on an approval, and only when it narrows the request.
    const reading = input.decision === "approve" ? input.cap : null;
    if (reading && !isPlausibleCap(reading, existing)) throw new InvalidRequestInput("cap");
    const cap = reading ? resolveCap(reading, existing) : null;

    const updated = await updateStatusAndCap(existing.id, status, cap, tx);

    const record =
      input.decision === "approve"
        ? await insertEvent(
            {
              requestId: updated.id,
              title: existing.item,
              unit: existing.unit,
              ...approvedFigures(existing, cap),
            },
            tx,
          )
        : null;

    await appendTrail(
      {
        requestId: updated.id,
        type: event,
        actor: input.actor,
        payload: {
          ...(input.note ? { note: input.note } : {}),
          ...(cap ? { cap: { quantity: cap.quantity, annualCents: cap.annualCents } } : {}),
          ...(record ? { eventId: record.id } : {}),
        },
        reading: input.reading,
      },
      tx,
    );

    return { request: updated, event: record, changed: true };
  });

  if (result.changed) {
    console.info({
      event: "decision_applied",
      reference: result.request.reference,
      status: result.request.status,
    });
  }
  return result;
}
