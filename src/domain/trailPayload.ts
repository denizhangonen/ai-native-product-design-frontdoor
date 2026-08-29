import type { CompleteRequest } from "@/domain/request";

/** What a creation or completion entry records: the fields as read, never the message. */
export function creationPayload(request: CompleteRequest) {
  return {
    item: request.item,
    quantity: request.quantity,
    unit: request.unit,
    amountCents: request.budget.amountCents,
    period: request.budget.period,
    currency: request.budget.currency,
    confidence: request.reading?.confidence ?? null,
  };
}
