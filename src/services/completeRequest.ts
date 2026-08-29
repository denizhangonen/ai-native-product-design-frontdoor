import { z } from "zod";
import { db } from "@/data/db";
import { type RequestFields, getRequestForUpdate, updateFields } from "@/data/requests";
import { appendTrail } from "@/data/trail";
import { InvalidRequestInput, InvalidTransition, RequestNotFound } from "@/domain/errors";
import { type PurchaseRequest, isComplete } from "@/domain/request";
import { creationPayload } from "@/domain/trailPayload";
import { describeIssues, fieldsSchema, readingSchema } from "@/services/requestInput";
import { type RoutedRequest, routeRequest } from "@/services/routeRequest";

const inputSchema = fieldsSchema.extend({
  requestId: z.string().min(1),
  reading: readingSchema,
});

export type CompleteRequestInput = z.input<typeof inputSchema>;

/** The follow-up fills in what it adds; what the first message already said is kept. */
export function mergeFields(existing: PurchaseRequest, answer: RequestFields): RequestFields {
  return {
    // The figure that counts is whichever message supplied the budget.
    amountInMessage: answer.budget ? answer.amountInMessage : existing.amountInMessage,
    item: answer.item ?? existing.item,
    quantity: answer.quantity ?? existing.quantity,
    unit: answer.unit ?? existing.unit,
    budget: answer.budget ?? existing.budget,
    team: answer.team ?? existing.team,
    urgency: answer.urgency ?? existing.urgency,
    reason: answer.reason ?? existing.reason,
  };
}

/** The follow-up answered the question: fill the request in and route it like any other. */
export async function completeRequest(input: CompleteRequestInput): Promise<RoutedRequest> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new InvalidRequestInput(describeIssues(parsed.error));

  const { requestId, reading, ...answer } = parsed.data;

  const result = await db().begin(async (tx) => {
    const existing = await getRequestForUpdate(requestId, tx);
    if (!existing) throw new RequestNotFound(requestId);
    // Only a request still waiting may be filled in; anything else has moved on.
    if (existing.status !== "needs_detail") throw new InvalidTransition(existing.status, "routed");

    const merged = mergeFields(existing, answer);
    if (merged.item === null || merged.budget === null) throw new InvalidRequestInput("item, budget");

    const filled = await updateFields(existing.id, merged, reading, tx);
    if (!isComplete(filled)) throw new InvalidRequestInput("item, budget");

    await appendTrail(
      {
        requestId: filled.id,
        type: "detail_received",
        actor: filled.requester.slackUserId,
        payload: creationPayload(filled),
        reading: filled.reading,
      },
      tx,
    );

    return routeRequest(filled, tx);
  });

  console.info({
    event: "request_completed",
    reference: result.request.reference,
    route: result.policy.route,
  });
  return result;
}
