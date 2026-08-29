import { z } from "zod";
import { db } from "@/data/db";
import { insertRequest } from "@/data/requests";
import { appendTrail } from "@/data/trail";
import { InvalidRequestInput } from "@/domain/errors";
import { isComplete } from "@/domain/request";
import { creationPayload } from "@/domain/trailPayload";
import {
  budgetSchema,
  describeIssues,
  fieldsSchema,
  readingSchema,
  requesterSchema,
} from "@/services/requestInput";
import { type RoutedRequest, routeRequest } from "@/services/routeRequest";

const inputSchema = fieldsSchema.extend({
  requester: requesterSchema,
  item: z.string().min(1).max(200),
  budget: budgetSchema,
  reading: readingSchema,
});

export type SubmitRequestInput = z.input<typeof inputSchema>;

/** A complete request: stored, decided by the policy, and recorded, in one transaction. */
export async function submitRequest(input: SubmitRequestInput): Promise<RoutedRequest> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new InvalidRequestInput(describeIssues(parsed.error));

  const result = await db().begin(async (tx) => {
    const created = await insertRequest({ ...parsed.data, status: "received" }, tx);
    // Proven by the schema above; the type system cannot see through the insert.
    if (!isComplete(created)) throw new InvalidRequestInput("item, budget");

    await appendTrail(
      {
        requestId: created.id,
        type: "created",
        actor: created.requester.slackUserId,
        payload: creationPayload(created),
        reading: created.reading,
      },
      tx,
    );

    return routeRequest(created, tx);
  });

  console.info({
    event: "request_routed",
    reference: result.request.reference,
    route: result.policy.route,
  });
  return result;
}

