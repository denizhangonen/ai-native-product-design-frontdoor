import { describe, expect, it } from "vitest";
import { approvedFigures, capToAnnualCents, isPlausibleCap, resolveCap } from "@/domain/caps";
import type { CompleteRequest } from "@/domain/request";

function request(overrides: Partial<CompleteRequest> = {}): CompleteRequest {
  return {
    id: "req-1",
    reference: "PI-1001",
    requester: { slackUserId: "U1", displayName: "Requester" },
    item: "Figma",
    quantity: 5,
    unit: "seats",
    budget: { amountCents: 300_000, period: "annual", currency: "USD" },
    amountInMessage: true,
    team: "Design",
    urgency: null,
    reason: null,
    status: "with_procurement",
    reading: null,
    cap: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const NONE = { quantity: null, annualCents: null };

describe("isPlausibleCap", () => {
  it("accepts a reply with no cap", () => {
    expect(isPlausibleCap(NONE, request())).toBe(true);
  });

  it("accepts a quantity cap from one up to what was asked", () => {
    expect(isPlausibleCap({ ...NONE, quantity: 1 }, request())).toBe(true);
    expect(isPlausibleCap({ ...NONE, quantity: 4 }, request())).toBe(true);
    expect(isPlausibleCap({ ...NONE, quantity: 5 }, request())).toBe(true);
  });

  it("refuses a quantity cap above what was asked or below one", () => {
    expect(isPlausibleCap({ ...NONE, quantity: 6 }, request())).toBe(false);
    expect(isPlausibleCap({ ...NONE, quantity: 0 }, request())).toBe(false);
  });

  it("refuses a quantity cap on a request that never had a quantity", () => {
    expect(isPlausibleCap({ ...NONE, quantity: 2 }, request({ quantity: null }))).toBe(false);
  });

  it("accepts a budget cap from one cent up to the annual figure", () => {
    expect(isPlausibleCap({ ...NONE, annualCents: 1 }, request())).toBe(true);
    expect(isPlausibleCap({ ...NONE, annualCents: 300_000 }, request())).toBe(true);
  });

  it("refuses a budget cap above the annual figure", () => {
    expect(isPlausibleCap({ ...NONE, annualCents: 300_001 }, request())).toBe(false);
  });

  it("compares a budget cap with the annualised request", () => {
    const monthly = request({ budget: { amountCents: 25_000, period: "monthly", currency: "USD" } });
    expect(isPlausibleCap({ ...NONE, annualCents: 240_000 }, monthly)).toBe(true);
    expect(isPlausibleCap({ ...NONE, annualCents: 300_001 }, monthly)).toBe(false);
  });

  it("refuses a budget cap when the request's annual figure is unknown", () => {
    const unknown = request({ budget: { amountCents: 25_000, period: null, currency: "USD" } });
    expect(isPlausibleCap({ ...NONE, annualCents: 10_000 }, unknown)).toBe(false);
  });

  it("refuses a budget cap on a request made in another currency", () => {
    const euros = request({ budget: { amountCents: 300_000, period: "annual", currency: "EUR" } });
    expect(isPlausibleCap({ ...NONE, annualCents: 200_000 }, euros)).toBe(false);
    expect(isPlausibleCap({ ...NONE, quantity: 4 }, euros)).toBe(true);
  });

  it("needs both halves to be plausible when both are given", () => {
    expect(isPlausibleCap({ quantity: 4, annualCents: 200_000 }, request())).toBe(true);
    expect(isPlausibleCap({ quantity: 9, annualCents: 200_000 }, request())).toBe(false);
  });
});

describe("resolveCap", () => {
  it("records nothing for a cap equal to what was asked: that is a plain approval", () => {
    expect(resolveCap({ quantity: 5, annualCents: 300_000 }, request())).toBeNull();
  });

  it("keeps only the half that narrows the request", () => {
    expect(resolveCap({ quantity: 4, annualCents: 300_000 }, request())).toEqual({
      quantity: 4,
      annualCents: null,
    });
  });

  it("keeps a budget cap below the annual figure", () => {
    expect(resolveCap({ quantity: null, annualCents: 240_000 }, request())).toEqual({
      quantity: null,
      annualCents: 240_000,
    });
  });
});

describe("resolveCap on a request in another currency", () => {
  it("never records a budget cap against it", () => {
    const euros = request({ budget: { amountCents: 300_000, period: "annual", currency: "EUR" } });
    expect(resolveCap({ quantity: null, annualCents: 200_000 }, euros)).toBeNull();
  });
});

describe("approvedFigures", () => {
  it("shows the request as asked when there is no cap", () => {
    expect(approvedFigures(request(), null)).toEqual({
      quantity: 5,
      budget: { amountCents: 300_000, period: "annual", currency: "USD" },
    });
  });

  it("shows the capped seat count", () => {
    expect(approvedFigures(request(), { quantity: 4, annualCents: null }).quantity).toBe(4);
  });

  it("shows a budget cap as an annual USD figure on a yearly request", () => {
    expect(approvedFigures(request(), { quantity: null, annualCents: 240_000 }).budget).toEqual({
      amountCents: 240_000,
      period: "annual",
      currency: "USD",
    });
  });

  it("keeps a one-off a one-off, and a monthly figure monthly, when a money cap applies", () => {
    const oneOff = request({ budget: { amountCents: 300_000, period: "one_off", currency: "USD" } });
    expect(approvedFigures(oneOff, { quantity: null, annualCents: 200_000 }).budget).toEqual({
      amountCents: 200_000,
      period: "one_off",
      currency: "USD",
    });
    const monthly = request({ budget: { amountCents: 25_000, period: "monthly", currency: "USD" } });
    expect(approvedFigures(monthly, { quantity: null, annualCents: 240_000 }).budget).toEqual({
      amountCents: 20_000,
      period: "monthly",
      currency: "USD",
    });
  });
});

describe("capToAnnualCents", () => {
  it("multiplies a monthly limit by twelve", () => {
    expect(capToAnnualCents(200, "monthly", request())).toBe(240_000);
  });

  it("takes the request's own period when the reply gave none", () => {
    expect(capToAnnualCents(2000, null, request())).toBe(200_000);
    const monthly = request({ budget: { amountCents: 25_000, period: "monthly", currency: "USD" } });
    expect(capToAnnualCents(200, null, monthly)).toBe(240_000);
  });

  it("treats a one-off limit as a year's spend", () => {
    expect(capToAnnualCents(1500, "one_off", request())).toBe(150_000);
  });
});
