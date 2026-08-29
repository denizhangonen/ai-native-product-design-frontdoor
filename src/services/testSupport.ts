import type { PurchaseRequest } from "@/domain/request";

/** A complete, routed-looking request for service tests. Test-only. */
export function stubRequest(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: "req-1",
    reference: "PI-1001",
    requester: { slackUserId: "U123", displayName: "Requester" },
    item: "Figma",
    quantity: 5,
    unit: "seats",
    budget: { amountCents: 300_000, period: "annual", currency: "USD" },
    amountInMessage: true,
    team: "Design",
    urgency: "this_month",
    reason: "the design team is growing",
    status: "received",
    reading: null,
    cap: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}
