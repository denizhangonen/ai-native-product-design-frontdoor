import { describe, expect, it } from "vitest";
import { POLICY_FLAGS, decidePolicy, describeFlag } from "@/domain/policy";
import type { Budget } from "@/domain/request";

const THRESHOLD_CENTS = 100_000;

function usd(amountCents: number, period: Budget["period"] = "annual"): Budget {
  return { amountCents, period, currency: "USD" };
}

describe("decidePolicy", () => {
  it("guides spend at or below the threshold", () => {
    expect(decidePolicy(usd(60_000), THRESHOLD_CENTS).route).toBe("guided");
    expect(decidePolicy(usd(100_000), THRESHOLD_CENTS).route).toBe("guided");
  });

  it("sends one cent over the threshold to procurement", () => {
    expect(decidePolicy(usd(100_001), THRESHOLD_CENTS).route).toBe("procurement");
  });

  it("compares a monthly figure by the year", () => {
    expect(decidePolicy(usd(8_333, "monthly"), THRESHOLD_CENTS).route).toBe("guided");
    expect(decidePolicy(usd(8_334, "monthly"), THRESHOLD_CENTS).route).toBe("procurement");
  });

  it("treats a one-off cost like a year's spend", () => {
    expect(decidePolicy(usd(100_000, "one_off"), THRESHOLD_CENTS).route).toBe("guided");
    expect(decidePolicy(usd(100_001, "one_off"), THRESHOLD_CENTS).route).toBe("procurement");
  });

  it("guides nothing at all when the threshold is zero", () => {
    expect(decidePolicy(usd(1), 0).route).toBe("procurement");
    expect(decidePolicy(usd(0), 0).route).toBe("guided");
  });

  it("fails closed on a currency other than USD, however small", () => {
    const decision = decidePolicy({ amountCents: 100, period: "annual", currency: "EUR" }, THRESHOLD_CENTS);
    expect(decision.route).toBe("procurement");
    expect(decision.flags).toEqual(["currency_not_usd"]);
    expect(decision.reason).toMatch(/^Fails closed/);
  });

  it("fails closed when no currency was stated, however small", () => {
    const decision = decidePolicy({ amountCents: 100, period: "annual", currency: null }, THRESHOLD_CENTS);
    expect(decision.route).toBe("procurement");
    expect(decision.flags).toEqual(["currency_not_stated"]);
    expect(decision.reason).toContain("no currency was stated");
  });

  it("fails closed when the period is not stated, however small", () => {
    const decision = decidePolicy(usd(100, null), THRESHOLD_CENTS);
    expect(decision.route).toBe("procurement");
    expect(decision.flags).toEqual(["period_not_stated"]);
  });

  it("reports both flags when both apply", () => {
    const decision = decidePolicy({ amountCents: 100, period: null, currency: "GBP" }, THRESHOLD_CENTS);
    expect(decision.flags).toEqual(["currency_not_usd", "period_not_stated"]);
    expect(decision.reason).toContain("not in USD");
    expect(decision.reason).toContain("no billing period");
  });

  it("carries no flags when the threshold alone decided", () => {
    expect(decidePolicy(usd(500_000), THRESHOLD_CENTS).flags).toEqual([]);
    expect(decidePolicy(usd(500), THRESHOLD_CENTS).flags).toEqual([]);
  });

  it("explains itself with the annual figure and the threshold", () => {
    const decision = decidePolicy(usd(300_000), THRESHOLD_CENTS);
    expect(decision.reason).toBe("$3,000/year is above the $1,000/year threshold, so procurement must approve");
  });

  it("shows the figure as read when it had to be annualised", () => {
    const decision = decidePolicy(usd(25_000, "monthly"), THRESHOLD_CENTS);
    expect(decision.reason).toContain("$3,000/year ($250/month)");
  });

  it("fails closed when code could not find the figure in the message", () => {
    const decision = decidePolicy(usd(100), THRESHOLD_CENTS, false);
    expect(decision.route).toBe("procurement");
    expect(decision.flags).toEqual(["amount_not_in_message"]);
    expect(decision.reason).toContain("not written in the message");
  });

  it("has a sentence for every flag", () => {
    for (const flag of POLICY_FLAGS) expect(describeFlag(flag).length).toBeGreaterThan(10);
  });
});

