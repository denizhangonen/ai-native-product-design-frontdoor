import { describe, expect, it } from "vitest";
import type { Extraction } from "@/ai/schemas";
import { extractionToFields } from "@/services/extractionToFields";

const BASE: Extraction = {
  item: "Figma",
  quantity: 5,
  unit: "seats",
  amount: 2999.99,
  period: "annual",
  currency: "USD",
  team: "Design",
  urgency: "this_month",
  reason: null,
  rationale: null,
  confidence: 0.9,
};

const TEXT = "Need Figma, 5 seats, $2,999.99 a year";

describe("extractionToFields", () => {
  it("turns the amount into whole cents", () => {
    expect(extractionToFields(BASE, TEXT).budget).toEqual({
      amountCents: 299_999,
      period: "annual",
      currency: "USD",
    });
  });

  it("rounds rather than truncating", () => {
    expect(extractionToFields({ ...BASE, amount: 0.1 + 0.2 }, "0.30").budget?.amountCents).toBe(30);
  });

  it("has no budget when there was no amount, whatever else was said", () => {
    const fields = extractionToFields({ ...BASE, amount: null, period: "annual" }, TEXT);
    expect(fields.budget).toBeNull();
    expect(fields.amountInMessage).toBe(false);
  });

  it("keeps a missing currency missing, so the policy can fail closed", () => {
    expect(extractionToFields({ ...BASE, currency: null }, TEXT).budget?.currency).toBeNull();
  });

  it("marks the figure as found when it is written in the message", () => {
    expect(extractionToFields(BASE, TEXT).amountInMessage).toBe(true);
  });

  it("marks the figure as not found when the model read a number that is not there", () => {
    expect(extractionToFields(BASE, "Need Figma, 5 seats, cheap").amountInMessage).toBe(false);
  });
});
