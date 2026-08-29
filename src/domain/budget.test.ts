import { describe, expect, it } from "vitest";
import { annualBudgetCents, annualiseCents } from "@/domain/budget";

describe("annualiseCents", () => {
  it("multiplies a monthly figure by twelve", () => {
    expect(annualiseCents(25_000, "monthly")).toBe(300_000);
  });

  it("keeps an annual figure as it is", () => {
    expect(annualiseCents(300_000, "annual")).toBe(300_000);
  });

  it("counts a one-off cost as a year's spend", () => {
    expect(annualiseCents(120_000, "one_off")).toBe(120_000);
  });
});

describe("annualBudgetCents", () => {
  it("is unknown when the period is unknown", () => {
    expect(annualBudgetCents({ amountCents: 100, period: null, currency: "USD" })).toBeNull();
  });

  it("annualises when the period is known", () => {
    expect(annualBudgetCents({ amountCents: 8_334, period: "monthly", currency: "USD" })).toBe(
      100_008,
    );
  });
});
