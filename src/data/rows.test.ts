import { describe, expect, it } from "vitest";
import { type RequestRow, toPurchaseRequest } from "@/data/rows";

const ROW: RequestRow = {
  id: "req-1",
  reference: "PI-1042",
  slack_user_id: "U1",
  requester_name: "Requester",
  item: "Figma",
  quantity: 5,
  unit: "seats",
  budget_amount_cents: "300000",
  budget_period: "annual",
  budget_currency: "USD",
  amount_in_message: true,
  team: "Design",
  urgency: "this_month",
  reason: "the design team is growing",
  status: "with_procurement",
  parse_confidence: "0.950",
  parse_rationale: "Item, seats and a yearly figure are all stated plainly.",
  parse_model: "openai:gpt-4.1-nano",
  cap_quantity: null,
  cap_annual_cents: null,
  created_at: new Date(0),
  updated_at: new Date(0),
};

describe("toPurchaseRequest", () => {
  it("maps the columns onto the request", () => {
    const request = toPurchaseRequest(ROW);

    expect(request.item).toBe("Figma");
    expect(request.quantity).toBe(5);
    expect(request.unit).toBe("seats");
    expect(request.team).toBe("Design");
    expect(request.urgency).toBe("this_month");
    expect(request.status).toBe("with_procurement");
  });

  it("turns the bigint and numeric strings Postgres returns back into numbers", () => {
    const request = toPurchaseRequest(ROW);
    expect(request.budget).toEqual({ amountCents: 300_000, period: "annual", currency: "USD" });
    expect(request.reading?.confidence).toBe(0.95);
  });

  it("has no budget while the request is waiting for detail", () => {
    const held = { ...ROW, budget_amount_cents: null, budget_period: null, budget_currency: null };
    expect(toPurchaseRequest(held).budget).toBeNull();
  });

  it("reports no reading when none was recorded", () => {
    const older = { ...ROW, parse_confidence: null, parse_rationale: null, parse_model: null };
    expect(toPurchaseRequest(older).reading).toBeNull();
  });

  it("carries whether code found the figure in the message", () => {
    expect(toPurchaseRequest(ROW).amountInMessage).toBe(true);
    expect(toPurchaseRequest({ ...ROW, amount_in_message: false }).amountInMessage).toBe(false);
  });

  it("reports no cap when procurement set none", () => {
    expect(toPurchaseRequest(ROW).cap).toBeNull();
  });

  it("carries a cap with either half", () => {
    expect(toPurchaseRequest({ ...ROW, cap_quantity: 4 }).cap).toEqual({ quantity: 4, annualCents: null });
    expect(toPurchaseRequest({ ...ROW, cap_annual_cents: "240000" }).cap).toEqual({
      quantity: null,
      annualCents: 240_000,
    });
  });
});
